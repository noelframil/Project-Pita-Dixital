import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { whatsappAdapter } from '../src/channels/whatsapp.js';
import type { ChannelAccount } from '../src/channels/types.js';

const cuenta = (appSecret?: string): ChannelAccount => ({
  id: 'acc', clientId: 'cli', channel: 'whatsapp', externalId: '123',
  credentials: appSecret ? { appSecret } : {},
});

const firmar = (body: string, secreto: string) =>
  'sha256=' + crypto.createHmac('sha256', secreto).update(body, 'utf8').digest('hex');

describe('firma del webhook de WhatsApp', () => {
  const body = '{"object":"whatsapp_business_account"}';

  it('acepta una firma correcta', () => {
    const h = { 'x-hub-signature-256': firmar(body, 'secreto') };
    assert.equal(whatsappAdapter.verify!(body, h, cuenta('secreto')), true);
  });

  it('rechaza una firma de otro secreto', () => {
    const h = { 'x-hub-signature-256': firmar(body, 'otro') };
    assert.equal(whatsappAdapter.verify!(body, h, cuenta('secreto')), false);
  });

  it('rechaza si el cuerpo cambió aunque la firma sea válida para otro cuerpo', () => {
    const h = { 'x-hub-signature-256': firmar(body, 'secreto') };
    assert.equal(whatsappAdapter.verify!(body + 'x', h, cuenta('secreto')), false);
  });

  it('falla cerrado si la cuenta no tiene appSecret', () => {
    // Antes reventaba en createHmac; ahora rechaza.
    const h = { 'x-hub-signature-256': firmar(body, 'secreto') };
    assert.equal(whatsappAdapter.verify!(body, h, cuenta()), false);
  });

  it('una firma recortada se rechaza, no tumba el manejador', () => {
    // timingSafeEqual lanza RangeError con longitudes distintas.
    const h = { 'x-hub-signature-256': 'sha256=abc' };
    assert.doesNotThrow(() => whatsappAdapter.verify!(body, h, cuenta('secreto')));
    assert.equal(whatsappAdapter.verify!(body, h, cuenta('secreto')), false);
  });

  it('sin cabecera de firma se rechaza', () => {
    assert.equal(whatsappAdapter.verify!(body, {}, cuenta('secreto')), false);
  });
});
