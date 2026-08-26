import './helpers/env.js';
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { runAgent } from '../src/core/agent.js';
import { HANDOFF_TOOL, HANDOFF_TOOL_NAME } from '../src/core/handoff.js';
import type { RegisteredTool } from '../src/core/tools.js';
import { FakeOllama } from './helpers/fake-ollama.js';

const fake = new FakeOllama();

before(async () => fake.start());
after(async () => fake.stop());
beforeEach(() => fake.reset());

/**
 * Herramienta que siempre falla al ejecutarse: apunta a una dirección interna,
 * que el propio ejecutor rechaza. Sirve para probar el error en cascada sin
 * depender de ninguna red.
 */
const toolQueFalla: RegisteredTool = {
  id: 'tool-1',
  name: 'consultar_stock',
  description: 'Consulta el stock',
  inputSchema: { type: 'object', properties: { sku: { type: 'string' } } },
  kind: 'http',
  config: { method: 'GET', url: 'https://127.0.0.1/stock/{{sku}}' },
};

function baseOptions(overrides: Partial<Parameters<typeof runAgent>[0]> = {}) {
  return {
    provider: 'ollama',
    model: 'de-mentira',
    system: 'Eres un asistente.',
    clientId: 'test-client',
    messages: [{ role: 'user' as const, content: 'hola' }],
    temperature: 0.7,
    maxTokens: 500,
    maxIterations: 3,
    tools: [] as RegisteredTool[],
    conversationId: '00000000-0000-0000-0000-000000000001',
    ...overrides,
  };
}

describe('runAgent — parada', () => {
  it('para en cuanto el modelo contesta sin pedir herramientas', async () => {
    fake.script = [{ content: 'Buenas, ¿en qué te ayudo?' }];

    const run = await runAgent(baseOptions());

    assert.equal(run.stopReason, 'final_answer');
    assert.equal(run.text, 'Buenas, ¿en qué te ayudo?');
    assert.equal(run.steps.length, 1);
    assert.equal(fake.requests.length, 1);
  });

  it('encadena varias vueltas y acumula el coste de todas', async () => {
    fake.script = [
      { content: '', toolCalls: [{ name: 'consultar_stock', arguments: { sku: 'A1' } }] },
      { content: '', toolCalls: [{ name: 'consultar_stock', arguments: { sku: 'B2' } }] },
      { content: 'Ninguno de los dos está disponible.' },
    ];

    const run = await runAgent(baseOptions({ tools: [toolQueFalla] }));

    assert.equal(run.stopReason, 'final_answer');
    assert.equal(run.steps.length, 3);
    assert.equal(fake.requests.length, 3);
    // 100 + 50 tokens por vuelta, tres vueltas.
    assert.equal(run.usage.promptTokens, 300);
    assert.equal(run.usage.completionTokens, 150);
  });

  it('corta al agotar las vueltas y lo dice en stopReason', async () => {
    // Un modelo atascado que pide herramientas sin parar.
    fake.script = Array.from({ length: 10 }, (_, i) => ({
      content: '',
      toolCalls: [{ name: 'consultar_stock', arguments: { sku: `SKU${i}` } }],
    }));

    const run = await runAgent(baseOptions({ tools: [toolQueFalla], maxIterations: 2 }));

    assert.equal(run.stopReason, 'max_iterations');
    // maxIterations + 1: la última vuelta es la que contesta sin herramientas.
    assert.equal(fake.requests.length, 3);
  });

  it('retira las herramientas en la última vuelta', async () => {
    // Si se dejaran, el modelo podría pedir una llamada que ya no se va a
    // ejecutar y contestar contando con un dato que nunca llegó.
    fake.script = [
      { content: '', toolCalls: [{ name: 'consultar_stock', arguments: { sku: 'A' } }] },
      { content: '', toolCalls: [{ name: 'consultar_stock', arguments: { sku: 'B' } }] },
    ];

    await runAgent(baseOptions({ tools: [toolQueFalla], maxIterations: 1 }));

    assert.ok(Array.isArray(fake.requests[0]!.tools), 'la primera vuelta ofrece herramientas');
    assert.equal(fake.requests[1]!.tools, undefined, 'la última no las ofrece');
  });
});

describe('runAgent — errores en cascada', () => {
  it('un fallo de herramienta no rompe el turno: vuelve al modelo como texto', async () => {
    fake.script = [
      { content: '', toolCalls: [{ name: 'consultar_stock', arguments: { sku: 'A1' } }] },
      { content: 'Ahora mismo no puedo consultar el stock, lo siento.' },
    ];

    const run = await runAgent(baseOptions({ tools: [toolQueFalla] }));

    assert.equal(run.stopReason, 'final_answer');
    assert.equal(run.steps[0]!.results[0]!.isError, true);

    // El error viaja al modelo como un turno de rol 'tool' en la vuelta siguiente.
    const segunda = fake.requests[1]!.messages as Array<{ role: string; content: string }>;
    const resultado = segunda.find((m) => m.role === 'tool');
    assert.ok(resultado, 'la segunda vuelta incluye el resultado de la herramienta');
    assert.match(resultado.content, /interna|No se pudo ejecutar/);
  });

  it('una herramienta inventada se contesta con la lista de las que existen', async () => {
    fake.script = [
      { content: '', toolCalls: [{ name: 'herramienta_que_no_existe', arguments: {} }] },
      { content: 'Perdona, me he equivocado.' },
    ];

    const run = await runAgent(baseOptions({ tools: [toolQueFalla] }));

    const resultado = run.steps[0]!.results[0]!;
    assert.equal(resultado.isError, true);
    assert.match(resultado.content, /No existe ninguna herramienta/);
    assert.match(resultado.content, /consultar_stock/); // le dice cuáles sí hay
  });

  it('corta la llamada idéntica repetida dentro del mismo turno', async () => {
    // Un modelo atascado repite la misma llamada esperando otro resultado.
    fake.script = [
      { content: '', toolCalls: [{ name: 'consultar_stock', arguments: { sku: 'A1' } }] },
      { content: '', toolCalls: [{ name: 'consultar_stock', arguments: { sku: 'A1' } }] },
      { content: 'No lo consigo.' },
    ];

    const run = await runAgent(baseOptions({ tools: [toolQueFalla] }));

    assert.match(run.steps[1]!.results[0]!.content, /Ya llamaste/);
    // Y no se vuelve a salir a la red por algo que ya se sabe que no funciona.
    assert.equal(run.steps[1]!.results[0]!.latencyMs, 0);
  });

  it('ejecuta en paralelo las llamadas de una misma tanda', async () => {
    fake.script = [
      {
        content: '',
        toolCalls: [
          { name: 'consultar_stock', arguments: { sku: 'A' } },
          { name: 'consultar_stock', arguments: { sku: 'B' } },
        ],
      },
      { content: 'Ninguno disponible.' },
    ];

    const run = await runAgent(baseOptions({ tools: [toolQueFalla] }));

    assert.equal(run.steps[0]!.results.length, 2);
    // Los dos resultados vuelven juntos en la misma vuelta siguiente.
    const segunda = fake.requests[1]!.messages as Array<{ role: string }>;
    assert.equal(segunda.filter((m) => m.role === 'tool').length, 2);
  });
});

describe('runAgent — herramientas del sistema', () => {
  it('una herramienta SIN ejecutor corta el bucle en seco', async () => {
    // Así funciona el handoff: la decisión de qué hacer con la conversación no
    // es del bucle, así que devuelve el control a quien llamó.
    fake.script = [
      {
        content: '',
        toolCalls: [
          {
            name: HANDOFF_TOOL_NAME,
            arguments: {
              motivo: 'frustracion',
              resumen: 'Lleva tres mensajes enfadado con un cobro duplicado.',
              urgencia: 'alta',
            },
          },
        ],
      },
      { content: 'Esto no debería llegar a ejecutarse.' },
    ];

    const run = await runAgent(
      baseOptions({ tools: [toolQueFalla], builtins: [{ spec: HANDOFF_TOOL }] }),
    );

    assert.equal(run.stopReason, 'interrupted');
    assert.equal(run.interruptedBy?.toolName, HANDOFF_TOOL_NAME);
    assert.equal(run.interruptedBy?.input.motivo, 'frustracion');
    assert.match(String(run.interruptedBy?.input.resumen), /cobro duplicado/);
    // Seguir razonando después de decidir que hace falta una persona es gastar
    // por gastar: solo hubo una llamada al modelo.
    assert.equal(fake.requests.length, 1);
  });

  it('una herramienta CON ejecutor se ejecuta y el bucle sigue', async () => {
    const llamadas: Array<Record<string, unknown>> = [];

    fake.script = [
      { content: '', toolCalls: [{ name: 'recordar', arguments: { dato: 'se llama Carlos' } }] },
      { content: 'Encantado, Carlos.' },
    ];

    const run = await runAgent(
      baseOptions({
        builtins: [
          {
            spec: { name: 'recordar', description: 'x', inputSchema: { type: 'object' } },
            handler: async (input) => {
              llamadas.push(input);
              return 'Anotado.';
            },
          },
        ],
      }),
    );

    assert.equal(run.stopReason, 'final_answer');
    assert.equal(run.text, 'Encantado, Carlos.');
    assert.deepEqual(llamadas, [{ dato: 'se llama Carlos' }]);
    // El resultado del ejecutor llegó al modelo en la vuelta siguiente.
    const segunda = fake.requests[1]!.messages as Array<{ role: string; content: string }>;
    assert.equal(segunda.find((m) => m.role === 'tool')?.content, 'Anotado.');
  });

  it('un ejecutor que lanza se contesta como error, sin romper el turno', async () => {
    fake.script = [
      { content: '', toolCalls: [{ name: 'rompe', arguments: {} }] },
      { content: 'No he podido, lo siento.' },
    ];

    const run = await runAgent(
      baseOptions({
        builtins: [
          {
            spec: { name: 'rompe', description: 'x', inputSchema: { type: 'object' } },
            handler: async () => {
              throw new Error('la base de datos no responde');
            },
          },
        ],
      }),
    );

    assert.equal(run.stopReason, 'final_answer');
    assert.equal(run.steps[0]!.results[0]!.isError, true);
    assert.match(run.steps[0]!.results[0]!.content, /la base de datos no responde/);
  });

  it('ofrece las del sistema junto a las del cliente', async () => {
    fake.script = [{ content: 'hola' }];

    await runAgent(baseOptions({ tools: [toolQueFalla], builtins: [{ spec: HANDOFF_TOOL }] }));

    const tools = fake.requests[0]!.tools as Array<{ function: { name: string } }>;
    const nombres = tools.map((t) => t.function.name);
    assert.deepEqual(nombres.sort(), ['consultar_stock', HANDOFF_TOOL_NAME].sort());
  });
});
