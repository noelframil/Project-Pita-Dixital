import './helpers/env.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ChatMessage } from '../src/llm/index.js';
import { toAnthropicMessages } from '../src/llm/anthropic.js';
import { parseToolArguments, toOpenAiMessages } from '../src/llm/openai.js';

/** Un turno con dos llamadas en paralelo y sus dos resultados. */
const conHerramientas: ChatMessage[] = [
  { role: 'user', content: '¿qué tiempo hace?' },
  {
    role: 'assistant',
    content: 'Voy a mirarlo.',
    toolCalls: [
      { id: 'c1', name: 'tiempo', input: { ciudad: 'Vigo' } },
      { id: 'c2', name: 'tiempo', input: { ciudad: 'Nigrán' } },
    ],
  },
  { role: 'tool', content: '18 grados', toolCallId: 'c1' },
  { role: 'tool', content: '19 grados', toolCallId: 'c2' },
];

describe('Anthropic — traducción de mensajes', () => {
  it('agrupa TODOS los resultados de una tanda en un único turno', () => {
    // Es la particularidad que más cuesta descubrir: partirlos en turnos
    // consecutivos devuelve un 400, porque cada tool_use necesita su
    // tool_result en la respuesta inmediata.
    const out = toAnthropicMessages(conHerramientas);
    assert.equal(out.length, 3);
    assert.ok(Array.isArray(out[2]!.content));
    assert.equal((out[2]!.content as unknown[]).length, 2);
  });

  it('entrega los resultados con rol user, no con un rol propio', () => {
    const out = toAnthropicMessages(conHerramientas);
    assert.equal(out[2]!.role, 'user');
    const bloque = (out[2]!.content as unknown as Array<Record<string, unknown>>)[0]!;
    assert.equal(bloque.type, 'tool_result');
    assert.equal(bloque.tool_use_id, 'c1');
  });

  it('mete texto y llamadas en el mismo turno del asistente', () => {
    const out = toAnthropicMessages(conHerramientas);
    assert.equal((out[1]!.content as unknown[]).length, 3); // 1 texto + 2 tool_use
  });

  it('no emite un bloque de texto vacío cuando solo hay llamadas', () => {
    // Un bloque de texto en blanco es un 400.
    const out = toAnthropicMessages([
      { role: 'assistant', content: '   ', toolCalls: [{ id: 'c1', name: 'x', input: {} }] },
    ]);
    assert.equal((out[0]!.content as unknown[]).length, 1);
  });

  it('deja pasar una conversación normal sin tocarla', () => {
    const out = toAnthropicMessages([
      { role: 'user', content: 'hola' },
      { role: 'assistant', content: 'buenas' },
    ]);
    assert.deepEqual(out, [
      { role: 'user', content: 'hola' },
      { role: 'assistant', content: 'buenas' },
    ]);
  });
});

describe('OpenAI y Ollama — traducción de mensajes', () => {
  it('usa un mensaje por resultado, con su tool_call_id', () => {
    const out = toOpenAiMessages(conHerramientas);
    assert.equal(out.length, 4);
    assert.equal(out[2]!.role, 'tool');
    assert.equal(out[2]!.tool_call_id, 'c1');
  });

  it('serializa los argumentos a cadena', () => {
    const out = toOpenAiMessages(conHerramientas);
    const llamadas = (out[1] as { tool_calls: Array<{ function: { arguments: unknown } }> })
      .tool_calls;
    assert.equal(typeof llamadas[0]!.function.arguments, 'string');
  });

  it('manda content null y no cadena vacía cuando solo hay llamadas', () => {
    const out = toOpenAiMessages([
      { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'x', input: {} }] },
    ]);
    assert.equal(out[0]!.content, null);
  });
});

describe('parseToolArguments', () => {
  it('no revienta con JSON roto', () => {
    // Un modelo puede devolver argumentos que no parsean. Eso es un fallo de esa
    // llamada, no de la respuesta entera: se entrega vacío y el ejecutor
    // devolverá un error que el modelo puede leer y corregir.
    assert.deepEqual(parseToolArguments('{roto'), {});
  });

  it('devuelve objeto vacío si no hay argumentos', () => {
    assert.deepEqual(parseToolArguments(undefined), {});
  });

  it('descarta lo que no sea un objeto', () => {
    assert.deepEqual(parseToolArguments('"una cadena"'), {});
    assert.deepEqual(parseToolArguments('null'), {});
  });

  it('parsea lo correcto', () => {
    assert.deepEqual(parseToolArguments('{"ciudad":"Vigo"}'), { ciudad: 'Vigo' });
  });
});
