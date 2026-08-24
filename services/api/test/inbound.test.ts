import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyResendWebhook, limpiarCita, extraerDireccion } from '../src/outreach/inbound.js';

const SECRETO = 'whsec_' + Buffer.from('clave-de-prueba-para-firmar').toString('base64');

function firmar(body: string, id = 'msg_1', ts = String(Math.floor(Date.now() / 1000))) {
  const clave = Buffer.from(SECRETO.replace(/^whsec_/, ''), 'base64');
  const sig = createHmac('sha256', clave).update(`${id}.${ts}.${body}`).digest('base64');
  return { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': `v1,${sig}` };
}

describe('firma del webhook de Resend', () => {
  const body = '{"type":"email.received"}';

  it('acepta una firma correcta', () => {
    assert.equal(verifyResendWebhook(body, firmar(body), SECRETO).ok, true);
  });

  it('rechaza si el cuerpo cambió', () => {
    assert.equal(verifyResendWebhook(body + 'x', firmar(body), SECRETO).ok, false);
  });

  it('rechaza una marca de tiempo vieja', () => {
    // Sin ventana temporal, una petición capturada valdría para siempre.
    const viejo = String(Math.floor(Date.now() / 1000) - 3600);
    const r = verifyResendWebhook(body, firmar(body, 'msg_1', viejo), SECRETO);
    assert.equal(r.ok, false);
    assert.match(r.motivo!, /ventana/);
  });

  it('acepta si UNA de varias firmas cuadra', () => {
    // Durante una rotación de secreto conviven dos firmas en la cabecera.
    const h = firmar(body);
    h['svix-signature'] = `v1,firmaVieja ${h['svix-signature']}`;
    assert.equal(verifyResendWebhook(body, h, SECRETO).ok, true);
  });

  it('rechaza sin cabeceras', () => {
    assert.equal(verifyResendWebhook(body, {}, SECRETO).ok, false);
  });

  it('una firma recortada no lanza excepción', () => {
    const h = firmar(body);
    h['svix-signature'] = 'v1,abc';
    assert.doesNotThrow(() => verifyResendWebhook(body, h, SECRETO));
    assert.equal(verifyResendWebhook(body, h, SECRETO).ok, false);
  });
});

describe('limpieza de la cita', () => {
  it('corta en "El ... escribió:"', () => {
    const t = 'Interesado, mándame el perfil.\n\nEl 24 ago 2026, Zenith escribió:\n> texto anterior';
    assert.equal(limpiarCita(t), 'Interesado, mándame el perfil.');
  });

  it('corta en "On ... wrote:"', () => {
    const t = 'Please send it.\n\nOn Aug 24, 2026, Zenith wrote:\n> previous';
    assert.equal(limpiarCita(t), 'Please send it.');
  });

  it('quita líneas citadas sueltas', () => {
    assert.equal(limpiarCita('Vale.\n> cita\n> más cita'), 'Vale.');
  });

  it('deja intacto un correo sin cita', () => {
    assert.equal(limpiarCita('¿Cuál es el ticket mínimo?'), '¿Cuál es el ticket mínimo?');
  });

  it('sin esto el agente respondería a su propio mensaje anterior', () => {
    const t = 'Sí.\n\nDe: Zenith Rise Capital\nAsunto: Olivar\n\nEstimado...';
    assert.equal(limpiarCita(t), 'Sí.');
  });
});

describe('extracción de la dirección', () => {
  it('saca el correo de un remitente con nombre', () => {
    assert.equal(extraerDireccion('Frank Albrecht <f.albrecht@altamarcam.com>'), 'f.albrecht@altamarcam.com');
  });
  it('acepta una dirección pelada y normaliza mayúsculas', () => {
    assert.equal(extraerDireccion('  Fulano@Ejemplo.COM '), 'fulano@ejemplo.com');
  });
});
