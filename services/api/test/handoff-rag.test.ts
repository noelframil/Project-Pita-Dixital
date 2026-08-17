import './helpers/env.js';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';
import type { ChatMessage } from '../src/llm/index.js';
import { HANDOFF_TOOL, detectLoop, signWebhook } from '../src/core/handoff.js';
import { chunkMarkdown, chunkText } from '../src/core/chunking.js';
import { toPgVector } from '../src/llm/embeddings.js';

const user = (content: string): ChatMessage => ({ role: 'user', content });
const bot = (content: string): ChatMessage => ({ role: 'assistant', content });

describe('detectLoop — la red de seguridad determinista', () => {
  // Es el caso que peor detecta un modelo desde dentro: cada turno le parece
  // razonable por separado y no percibe que lleva tres dando vueltas.

  it('detecta al usuario repitiendo la misma petición', () => {
    const historial = [
      user('quiero cancelar mi reserva del viernes'),
      bot('¿Me das el número de reserva?'),
      user('quiero cancelar la reserva del viernes'),
      bot('Necesito el número para localizarla.'),
      user('quiero cancelar mi reserva del viernes ya'),
    ];
    assert.equal(detectLoop(historial), true);
  });

  it('no salta en una conversación que avanza', () => {
    const historial = [
      user('¿tenéis wifi?'),
      bot('Sí, la clave es casa2024.'),
      user('¿y a qué hora es el desayuno?'),
      bot('De 8 a 10.'),
      user('perfecto, gracias'),
    ];
    assert.equal(detectLoop(historial), false);
  });

  it('ignora las tildes y los signos al comparar', () => {
    const historial = [
      user('¿cuánto cuesta la habitación doble?'),
      user('cuanto cuesta la habitacion doble'),
      user('¿Cuánto cuesta la habitación doble?'),
    ];
    assert.equal(detectLoop(historial), true);
  });

  it('no cuenta los mensajes cortos de cortesía', () => {
    // "sí", "vale", "ok" se repiten sin significar nada. Si contaran, cualquier
    // conversación educada acabaría derivada.
    const historial = [user('vale'), user('ok'), user('sí'), user('gracias')];
    assert.equal(detectLoop(historial), false);
  });

  it('no salta antes de alcanzar el umbral', () => {
    const historial = [user('quiero cancelar mi reserva'), user('quiero cancelar mi reserva')];
    assert.equal(detectLoop(historial, 3), false);
  });

  it('mira solo los mensajes recientes, no toda la conversación', () => {
    // Repetirse al principio y resolverlo no debería derivar media hora después.
    const historial = [
      user('quiero cancelar mi reserva'),
      user('quiero cancelar mi reserva'),
      bot('Hecho, cancelada.'),
      user('¿me llegará un correo de confirmación?'),
      user('vale gracias, muy amable'),
      user('una última cosa, ¿dónde aparco?'),
    ];
    assert.equal(detectLoop(historial), false);
  });
});

describe('signWebhook', () => {
  it('firma sobre marca de tiempo y cuerpo juntos', () => {
    // La marca va DENTRO de la firma, no solo enviada al lado: si no, quien
    // capture una entrega válida puede reenviarla indefinidamente.
    const secreto = 'secreto-de-prueba';
    const cuerpo = '{"event":"handoff.requested"}';
    const ts = '1770000000';

    const esperado = createHmac('sha256', secreto).update(`${ts}.${cuerpo}`).digest('hex');
    assert.equal(signWebhook(secreto, cuerpo, ts), esperado);
  });

  it('cambia si cambia la marca de tiempo', () => {
    const a = signWebhook('s', '{}', '1770000000');
    const b = signWebhook('s', '{}', '1770000001');
    assert.notEqual(a, b);
  });

  it('cambia si cambia el cuerpo', () => {
    const a = signWebhook('s', '{"a":1}', '1770000000');
    const b = signWebhook('s', '{"a":2}', '1770000000');
    assert.notEqual(a, b);
  });
});

describe('HANDOFF_TOOL — el esquema que ve el modelo', () => {
  it('exige los tres campos que necesita quien recoge la conversación', () => {
    const schema = HANDOFF_TOOL.inputSchema as {
      required: string[];
      additionalProperties: boolean;
    };
    assert.deepEqual(schema.required.sort(), ['motivo', 'resumen', 'urgencia']);
    // additionalProperties: false lo exigen los proveedores para el modo estricto.
    assert.equal(schema.additionalProperties, false);
  });

  it('describe cuándo llamarla, no solo qué hace', () => {
    // Es lo único con lo que el modelo decide. Una descripción que solo dice
    // "deriva a un humano" no le dice cuándo.
    assert.match(HANDOFF_TOOL.description, /pide hablar con una persona/i);
    assert.match(HANDOFF_TOOL.description, /duda/i);
  });
});

describe('chunkText — troceado', () => {
  it('no trocea lo que ya cabe', () => {
    const chunks = chunkText('Un texto corto.');
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0]!.text, 'Un texto corto.');
  });

  it('prefiere cortar por párrafo', () => {
    const parrafo = 'A'.repeat(700);
    const chunks = chunkText(`${parrafo}\n\n${parrafo}`, { maxChars: 800, overlapChars: 0 });

    assert.ok(chunks.length >= 2);
    // El corte cayó en la frontera de párrafo, así que ningún trozo mezcla los dos.
    assert.ok(!chunks[0]!.text.includes('\n\n'));
  });

  it('cae a fin de frase cuando no hay párrafos', () => {
    const frase = 'Esta es una frase de relleno con algo de longitud. ';
    const chunks = chunkText(frase.repeat(40), { maxChars: 600, overlapChars: 0 });

    assert.ok(chunks.length > 1);
    // Cortar por frase deja los trozos terminados en punto, no a media palabra.
    assert.ok(chunks[0]!.text.trim().endsWith('.'));
  });

  it('solapa los fragmentos consecutivos', () => {
    // Una respuesta que cae justo en la costura se pierde en ambos sin solape.
    const texto = Array.from({ length: 60 }, (_, i) => `Frase numero ${i} de relleno.`).join(' ');
    const chunks = chunkText(texto, { maxChars: 400, overlapChars: 120 });

    assert.ok(chunks.length > 2);
    const finalPrimero = chunks[0]!.text.slice(-40);
    const palabras = finalPrimero.split(' ').filter((w) => w.length > 4);
    assert.ok(
      palabras.some((w) => chunks[1]!.text.includes(w)),
      'el segundo fragmento repite algo del final del primero',
    );
  });

  it('numera los fragmentos en orden', () => {
    const chunks = chunkText('palabra '.repeat(2000), { maxChars: 500 });
    assert.deepEqual(
      chunks.map((c) => c.index),
      chunks.map((_, i) => i),
    );
  });

  it('acota el solape aunque se pida uno mayor que el fragmento', () => {
    // Sin tope, el cursor avanza de carácter en carácter y salen miles de
    // fragmentos casi idénticos: cada uno se paga como embedding y se guarda.
    const chunks = chunkText('x'.repeat(5000), { maxChars: 200, overlapChars: 500 });
    assert.ok(chunks.length > 0);
    // Con solape acotado a maxChars/2, el avance mínimo es 100 por vuelta.
    assert.ok(chunks.length <= 5000 / 100 + 2, `salieron ${chunks.length} fragmentos`);
  });

  it('devuelve vacío ante un texto vacío', () => {
    assert.deepEqual(chunkText('   \n\n  '), []);
  });
});

describe('chunkMarkdown', () => {
  it('corta por encabezados', () => {
    const doc = `# Wifi\n\nLa clave es casa2024.\n\n# Desayuno\n\nDe 8 a 10 en el porche.`;
    const chunks = chunkMarkdown(doc);

    assert.equal(chunks.length, 2);
    assert.match(chunks[0]!.text, /Wifi/);
    assert.match(chunks[1]!.text, /Desayuno/);
  });

  it('repite el título en los fragmentos siguientes de una sección larga', () => {
    // Un trozo que dice "el horario es de 9 a 14" sin decir de qué recupera mal
    // y se entiende peor.
    const doc = `# Horarios de la piscina\n\n${'Detalle del horario. '.repeat(200)}`;
    const chunks = chunkMarkdown(doc, { maxChars: 500 });

    assert.ok(chunks.length > 1);
    for (const chunk of chunks) {
      assert.match(chunk.text, /Horarios de la piscina/);
    }
  });

  it('cae al troceado normal si no hay encabezados', () => {
    const chunks = chunkMarkdown('Texto sin ningún encabezado. '.repeat(100), { maxChars: 400 });
    assert.ok(chunks.length > 1);
  });
});

describe('toPgVector', () => {
  it('serializa al literal que espera pgvector', () => {
    // Mandarlo como array de JS lo convertiría en float8[], que no es lo mismo
    // y falla al comparar con <=>.
    assert.equal(toPgVector([0.1, -0.2, 0.3]), '[0.1,-0.2,0.3]');
  });
});
