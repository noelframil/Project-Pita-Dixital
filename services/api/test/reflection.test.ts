import './helpers/env.js';
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { runAgent } from '../src/core/agent.js';
import { buildRejectionMessage, critique } from '../src/core/reflection.js';
import type { RegisteredTool } from '../src/core/tools.js';
import { FakeOllama } from './helpers/fake-ollama.js';

const fake = new FakeOllama();

// La suite corre sin Postgres, así que las trazas fallan y gritan por stdout.
// Se silencian para que la salida sea legible.
const originalError = console.error;
before(async () => {
  console.error = () => {};
  await fake.start();
});
after(async () => {
  console.error = originalError;
  await fake.stop();
});
beforeEach(() => fake.reset());

function baseOptions(overrides: Partial<Parameters<typeof runAgent>[0]> = {}) {
  return {
    provider: 'ollama',
    model: 'de-mentira',
    system: 'Eres un asistente de una casa rural.',
    clientId: 'test-client',
    messages: [{ role: 'user' as const, content: '¿a qué hora es el check-in?' }],
    temperature: 0.7,
    maxTokens: 500,
    maxIterations: 2,
    tools: [] as RegisteredTool[],
    conversationId: '00000000-0000-0000-0000-000000000001',
    ...overrides,
  };
}

const reflection = {
  provider: 'ollama',
  model: 'critico',
  maxReflections: 2,
  userMessage: '¿a qué hora es el check-in?',
};

describe('critique', () => {
  it('lee un veredicto de aprobación', async () => {
    fake.nextResponse = JSON.stringify({ is_compliant: true, feedback: '' });

    const { verdict } = await critique({
      provider: 'ollama',
      model: 'critico',
      userMessage: 'hola',
      systemPrompt: 'Eres amable.',
      draft: 'Buenas.',
    });

    assert.equal(verdict.isCompliant, true);
  });

  it('lee un rechazo con su motivo', async () => {
    fake.nextResponse = JSON.stringify({
      is_compliant: false,
      feedback: 'Afirmas que el check-in es a las 14:00 y ese dato no está en el contexto.',
    });

    const { verdict } = await critique({
      provider: 'ollama',
      model: 'critico',
      userMessage: 'hola',
      systemPrompt: 'x',
      draft: 'El check-in es a las 14:00.',
    });

    assert.equal(verdict.isCompliant, false);
    assert.match(verdict.feedback, /no está en el contexto/);
  });

  it('un veredicto ilegible se toma como aprobación', async () => {
    // El crítico es una red de seguridad opcional. Quedarse sin respuesta
    // porque el revisor devolvió basura sería cambiar un riesgo pequeño por
    // uno grande.
    fake.nextResponse = 'pues no sé qué decirte';

    const { verdict } = await critique({
      provider: 'ollama',
      model: 'critico',
      userMessage: 'hola',
      systemPrompt: 'x',
      draft: 'Buenas.',
    });

    assert.equal(verdict.isCompliant, true);
  });

  it('un JSON con is_compliant no booleano también aprueba', async () => {
    fake.nextResponse = JSON.stringify({ is_compliant: 'sí', feedback: 'x' });

    const { verdict } = await critique({
      provider: 'ollama',
      model: 'critico',
      userMessage: 'hola',
      systemPrompt: 'x',
      draft: 'Buenas.',
    });

    assert.equal(verdict.isCompliant, true);
  });

  it('desenvuelve el JSON metido en vallas de markdown', async () => {
    fake.nextResponse = '```json\n{"is_compliant":false,"feedback":"falta el tono"}\n```';

    const { verdict } = await critique({
      provider: 'ollama',
      model: 'critico',
      userMessage: 'hola',
      systemPrompt: 'x',
      draft: 'Buenas.',
    });

    assert.equal(verdict.isCompliant, false);
    assert.equal(verdict.feedback, 'falta el tono');
  });
});

describe('buildRejectionMessage', () => {
  it('deja claro que no lo escribió la persona', () => {
    // Sin esa aclaración, el modelo puede contestar al feedback como si fuera
    // un mensaje del usuario.
    const msg = buildRejectionMessage('inventaste el horario');
    assert.match(msg, /no la ha escrito la persona/i);
    assert.match(msg, /no debes mencionarla/i);
    assert.match(msg, /inventaste el horario/);
  });

  it('pide corregir solo ese punto', () => {
    // Sin esto, el modelo reescribe entero y se pierde lo que sí estaba bien.
    assert.match(buildRejectionMessage('x'), /Mantén el resto igual/);
  });
});

describe('sub-bucle de autocrítica dentro del agente', () => {
  it('el borrador aprobado sale tal cual, con una sola llamada al crítico', async () => {
    fake.script = [
      { content: 'El check-in es a partir de las 15:00.' },
      { content: JSON.stringify({ is_compliant: true, feedback: '' }) },
    ];

    const run = await runAgent(baseOptions({ reflection }));

    assert.equal(run.text, 'El check-in es a partir de las 15:00.');
    assert.equal(run.reflections.length, 1);
    assert.equal(run.reflections[0]!.verdict.isCompliant, true);
    // Una del agente + una del crítico. Ni una más.
    assert.equal(fake.requests.length, 2);
  });

  it('un borrador rechazado se reescribe y se vuelve a juzgar', async () => {
    fake.script = [
      { content: 'El check-in es a las 14:00.' }, // borrador 1
      { content: JSON.stringify({ is_compliant: false, feedback: 'ese dato no lo tienes' }) },
      { content: 'No tengo la hora exacta del check-in, te la confirmo enseguida.' }, // reescritura
      { content: JSON.stringify({ is_compliant: true, feedback: '' }) },
    ];

    const run = await runAgent(baseOptions({ reflection }));

    assert.match(run.text, /No tengo la hora exacta/);
    assert.equal(run.reflections.length, 2);
    assert.equal(run.reflections[0]!.verdict.isCompliant, false);
    assert.equal(run.reflections[1]!.verdict.isCompliant, true);
  });

  it('la reescritura recibe el motivo del rechazo', async () => {
    fake.script = [
      { content: 'borrador malo' },
      { content: JSON.stringify({ is_compliant: false, feedback: 'inventaste el precio' }) },
      { content: 'borrador bueno' },
      { content: JSON.stringify({ is_compliant: true, feedback: '' }) },
    ];

    await runAgent(baseOptions({ reflection }));

    // La tercera petición es la reescritura: debe llevar el feedback dentro.
    const mensajes = fake.requests[2]!.messages as Array<{ role: string; content: string }>;
    const nota = mensajes.find((m) => m.content?.includes('inventaste el precio'));
    assert.ok(nota, 'el motivo del rechazo llegó al modelo');
    // Con rol user y no system: es el único que funciona en los tres proveedores.
    assert.equal(nota.role, 'user');
  });

  it('la reescritura no ofrece herramientas', async () => {
    // Ofrecerlas convertiría el sub-bucle en un segundo bucle ReAct dentro del
    // primero, con el modelo saliendo otra vez a buscar datos.
    const tool: RegisteredTool = {
      id: 't1',
      name: 'consultar',
      description: 'x',
      inputSchema: { type: 'object', properties: {} },
      kind: 'http',
      config: { method: 'GET', url: 'https://ejemplo.com/x' },
    };

    fake.script = [
      { content: 'borrador' },
      { content: JSON.stringify({ is_compliant: false, feedback: 'mal' }) },
      { content: 'mejor' },
      { content: JSON.stringify({ is_compliant: true, feedback: '' }) },
    ];

    await runAgent(baseOptions({ reflection, tools: [tool] }));

    assert.ok(Array.isArray(fake.requests[0]!.tools), 'el agente sí las ofrece');
    assert.equal(fake.requests[2]!.tools, undefined, 'la reescritura no');
  });

  it('agotados los intentos, envía el último borrador en vez de nada', async () => {
    // Las alternativas son dejar al usuario sin respuesta o mandarle un error
    // genérico, y las dos son peores que un texto imperfecto.
    fake.script = [
      { content: 'intento 1' },
      { content: JSON.stringify({ is_compliant: false, feedback: 'mal' }) },
      { content: 'intento 2' },
      { content: JSON.stringify({ is_compliant: false, feedback: 'sigue mal' }) },
      { content: 'intento 3' },
    ];

    const run = await runAgent(baseOptions({ reflection }));

    assert.ok(run.text.length > 0, 'devuelve algo');
    assert.equal(run.reflections.length, 2); // maxReflections
    assert.equal(run.reflections.at(-1)!.verdict.isCompliant, false);
  });

  it('sin configuración de reflexión, no llama al crítico', async () => {
    fake.script = [{ content: 'respuesta directa' }];

    const run = await runAgent(baseOptions());

    assert.equal(run.text, 'respuesta directa');
    assert.equal(run.reflections.length, 0);
    assert.equal(fake.requests.length, 1);
  });

  it('acumula el coste del crítico en el total del turno', async () => {
    fake.script = [
      { content: 'borrador' },
      { content: JSON.stringify({ is_compliant: true, feedback: '' }) },
    ];

    const run = await runAgent(baseOptions({ reflection }));

    // 100 + 50 tokens por llamada, dos llamadas: la del agente y la del crítico.
    assert.equal(run.usage.promptTokens, 200);
    assert.equal(run.usage.completionTokens, 100);
  });
});
