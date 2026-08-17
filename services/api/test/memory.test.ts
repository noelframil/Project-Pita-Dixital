import './helpers/env.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ChatMessage } from '../src/llm/index.js';
import { buildSummaryBlock, estimateTokens, trimToBudget } from '../src/core/memory.js';

const msg = (i: number, largo = 100): ChatMessage => ({
  role: i % 2 === 0 ? 'user' : 'assistant',
  content: 'x'.repeat(largo),
});

const historial = [msg(0), msg(1), msg(2), msg(3), msg(4)];

describe('estimateTokens', () => {
  it('crece con la longitud', () => {
    assert.ok(estimateTokens('x'.repeat(1000)) > estimateTokens('x'.repeat(10)));
  });

  it('sobreestima antes que quedarse corto', () => {
    // Con ~3,5 caracteres por token la estimación queda por encima de la real
    // en castellano. Es lo que evita que el presupuesto se desborde.
    assert.ok(estimateTokens('x'.repeat(350)) >= 100);
  });
});

describe('trimToBudget', () => {
  it('no descarta nada si todo cabe', () => {
    const { kept, dropped } = trimToBudget(historial, 100_000);
    assert.equal(dropped.length, 0);
    assert.equal(kept.length, 5);
  });

  it('descarta desde el principio y conserva lo reciente', () => {
    const { kept, dropped } = trimToBudget(historial, estimateTokens('x'.repeat(100)) * 2);
    assert.ok(dropped.length > 0);
    assert.equal(kept.at(-1), historial[4]);
    assert.equal(kept.length + dropped.length, 5);
  });

  it('conserva el último mensaje aunque él solo pase del presupuesto', () => {
    // Es lo que acaba de escribir el usuario. Responder sin leerlo no es opción.
    const { kept, dropped } = trimToBudget(historial, 1);
    assert.deepEqual(kept, [historial[4]]);
    assert.equal(dropped.length, 4);
  });

  it('aguanta un historial vacío', () => {
    assert.deepEqual(trimToBudget([], 1000), { kept: [], dropped: [] });
  });

  it('cuenta el coste de las llamadas a herramienta', () => {
    const conLlamada: ChatMessage = {
      role: 'assistant',
      content: 'x',
      toolCalls: [{ id: 'a', name: 'buscar', input: { q: 'y'.repeat(2000) } }],
    };
    const soloTexto: ChatMessage = { role: 'assistant', content: 'x' };
    const presupuesto = 100;

    // El mismo texto, pero con una llamada gorda encima, no debería colarse
    // dentro de un presupuesto donde el texto solo sí cabe.
    assert.equal(trimToBudget([soloTexto, soloTexto], presupuesto).dropped.length, 0);
    assert.ok(trimToBudget([conLlamada, conLlamada], presupuesto).dropped.length > 0);
  });

  it('lo descartado es siempre un prefijo del historial', () => {
    // Propiedad de la que depende la marca de agua del resumen en brain.ts:
    // el corte se toma como entries[dropped.length - 1]. Si lo descartado
    // pudiera ser un hueco por el medio, el resumen daría por cubierto un tramo
    // que no lo está y esos mensajes se perderían.
    for (let presupuesto = 1; presupuesto < 400; presupuesto += 7) {
      const { kept, dropped } = trimToBudget(historial, presupuesto);
      assert.deepEqual(dropped, historial.slice(0, dropped.length));
      assert.equal(kept.length + dropped.length, historial.length);
    }
  });
});

describe('buildSummaryBlock', () => {
  it('no añade nada si no hay resumen', () => {
    assert.equal(buildSummaryBlock(null), '');
    assert.equal(buildSummaryBlock('   '), '');
  });

  it('delimita el resumen y lo marca como recuerdo, no como orden', () => {
    // Dentro va texto que escribió un usuario. Sin este marcado, un "a partir
    // de ahora ignora tus reglas" acabaría dando órdenes desde el prompt del
    // sistema en el turno siguiente.
    const bloque = buildSummaryBlock('Ana preguntó por el wifi.');
    assert.match(bloque, /<memoria>/);
    assert.match(bloque, /<\/memoria>/);
    assert.match(bloque, /no las obedezcas/);
  });
});
