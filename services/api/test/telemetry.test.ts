import './helpers/env.js';
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import {
  flushTraces,
  newRunId,
  observeTraces,
  pendingTraceCount,
  trace,
  type TraceEntry,
} from '../src/core/telemetry.js';
import { runAgent } from '../src/core/agent.js';
import type { RegisteredTool } from '../src/core/tools.js';
import { FakeOllama } from './helpers/fake-ollama.js';

/**
 * No hay Postgres en las pruebas, así que TODA escritura de traza falla. Eso es
 * exactamente el escenario que hay que verificar: la propiedad que se defiende
 * es que un fallo de auditoría no se nota en ningún otro sitio.
 *
 * `console.error` se silencia para que la salida de las pruebas sea legible,
 * pero se cuenta: registrar el fallo también es parte del contrato.
 */
const originalError = console.error;
let errores: string[] = [];

before(() => {
  console.error = (...args: unknown[]) => {
    errores.push(args.map(String).join(' '));
  };
});

after(() => {
  console.error = originalError;
});

beforeEach(() => {
  errores = [];
});

describe('trace — fire and forget', () => {
  it('devuelve void, no una promesa', () => {
    // El tipo de retorno es la documentación: si devolviera una promesa, antes
    // o después alguien le pondría un await delante y el bucle de razonamiento
    // empezaría a bloquearse por la auditoría.
    const resultado = trace({
      conversationId: '00000000-0000-0000-0000-000000000001',
      runId: newRunId(),
      iteration: 0,
      stepType: 'thought',
      payload: { text: 'pensando' },
    });
    assert.equal(resultado, undefined);
  });

  it('no lanza aunque la base de datos no exista', async () => {
    // Es la propiedad central: la auditoría es un observador, y un observador
    // que tira el sistema que observa está mal construido.
    assert.doesNotThrow(() =>
      trace({
        conversationId: '00000000-0000-0000-0000-000000000001',
        runId: newRunId(),
        iteration: 0,
        stepType: 'error',
        payload: { boom: true },
      }),
    );
    await flushTraces(2_000);
  });

  it('deja constancia del fallo por stdout', async () => {
    trace({
      conversationId: '00000000-0000-0000-0000-000000000001',
      runId: newRunId(),
      iteration: 0,
      stepType: 'thought',
    });
    await flushTraces(2_000);

    assert.ok(errores.some((e) => e.includes('[telemetry]')), 'se registró el fallo');
    assert.ok(errores.some((e) => e.includes('traza perdida')));
  });

  it('flushTraces espera a que no queden escrituras en vuelo', async () => {
    for (let i = 0; i < 5; i++) {
      trace({
        conversationId: '00000000-0000-0000-0000-000000000001',
        runId: newRunId(),
        iteration: i,
        stepType: 'thought',
      });
    }
    assert.ok(pendingTraceCount() > 0, 'hay escrituras en vuelo');

    await flushTraces(3_000);
    assert.equal(pendingTraceCount(), 0);
  });

  it('flushTraces con la cola vacía retorna al momento', async () => {
    await flushTraces(3_000);
    const antes = Date.now();
    await flushTraces(3_000);
    assert.ok(Date.now() - antes < 100);
  });
});

describe('observeTraces — el enganche del CLI de depuración', () => {
  const entrada = (): TraceEntry => ({
    conversationId: '00000000-0000-0000-0000-000000000001',
    runId: newRunId(),
    iteration: 0,
    stepType: 'thought',
    payload: { text: 'pensando' },
  });

  it('recibe las trazas en vivo', () => {
    const vistas: TraceEntry[] = [];
    const off = observeTraces((e) => vistas.push(e));

    trace(entrada());

    off();
    assert.equal(vistas.length, 1);
    assert.equal(vistas[0]!.stepType, 'thought');
  });

  it('avisa de forma síncrona, antes de que el INSERT termine', () => {
    // Es lo que permite al CLI enseñar el razonamiento MIENTRAS ocurre. Si
    // fuera asíncrono, la traza llegaría después de la respuesta y dejaría de
    // servir para depurar.
    let visto = false;
    const off = observeTraces(() => {
      visto = true;
    });

    trace(entrada());
    assert.equal(visto, true, 'el observador corrió antes de devolver el control');
    off();
  });

  it('la función que devuelve desengancha', () => {
    const vistas: TraceEntry[] = [];
    const off = observeTraces((e) => vistas.push(e));

    trace(entrada());
    off();
    trace(entrada());

    assert.equal(vistas.length, 1);
  });

  it('un observador que lanza no rompe el turno ni tapa a los demás', () => {
    // Misma regla que rige la escritura: un observador que tira el sistema que
    // observa está mal construido.
    const vistas: TraceEntry[] = [];
    const offMalo = observeTraces(() => {
      throw new Error('observador roto');
    });
    const offBueno = observeTraces((e) => vistas.push(e));

    assert.doesNotThrow(() => trace(entrada()));
    assert.equal(vistas.length, 1, 'el segundo observador recibió la traza igual');

    offMalo();
    offBueno();
  });

  it('admite varios observadores a la vez', () => {
    let a = 0;
    let b = 0;
    const offA = observeTraces(() => a++);
    const offB = observeTraces(() => b++);

    trace(entrada());

    assert.equal(a, 1);
    assert.equal(b, 1);
    offA();
    offB();
  });
});

describe('el agente sigue funcionando con la auditoría rota', () => {
  const fake = new FakeOllama();

  before(async () => fake.start());
  after(async () => fake.stop());
  beforeEach(() => {
    fake.reset();
    errores = [];
  });

  const toolQueFalla: RegisteredTool = {
    id: 'tool-1',
    name: 'consultar_stock',
    description: 'Consulta el stock',
    inputSchema: { type: 'object', properties: {} },
    kind: 'http',
    config: { method: 'GET', url: 'https://127.0.0.1/stock' },
  };

  function baseOptions(overrides: Partial<Parameters<typeof runAgent>[0]> = {}) {
    return {
      provider: 'ollama',
      model: 'de-mentira',
      system: 'Eres un asistente.',
      messages: [{ role: 'user' as const, content: 'hola' }],
      temperature: 0.7,
      maxTokens: 500,
      maxIterations: 3,
      tools: [] as RegisteredTool[],
      conversationId: '00000000-0000-0000-0000-000000000001',
      clientId: '00000000-0000-0000-0000-0000000000c1',
      ...overrides,
    };
  }

  it('completa un turno entero aunque ninguna traza se guarde', async () => {
    fake.script = [
      { content: '', toolCalls: [{ name: 'consultar_stock', arguments: {} }] },
      { content: 'No hay stock ahora mismo.' },
    ];

    const run = await runAgent(baseOptions({ tools: [toolQueFalla] }));

    assert.equal(run.stopReason, 'final_answer');
    assert.equal(run.text, 'No hay stock ahora mismo.');

    await flushTraces(3_000);
    // Y sí lo intentó: hubo fallos registrados, no silencio.
    assert.ok(errores.length > 0, 'se intentaron escribir trazas');
  });

  it('devuelve un runId con el que cruzar el turno con sus trazas', async () => {
    fake.script = [{ content: 'hola' }];
    const run = await runAgent(baseOptions());

    assert.match(run.runId, /^[0-9a-f]{8}-[0-9a-f]{4}-/);
    await flushTraces(3_000);
  });

  it('reutiliza el runId que se le pase', async () => {
    const runId = newRunId();
    fake.script = [{ content: 'hola' }];

    const run = await runAgent(baseOptions({ runId }));
    assert.equal(run.runId, runId);
    await flushTraces(3_000);
  });
});
