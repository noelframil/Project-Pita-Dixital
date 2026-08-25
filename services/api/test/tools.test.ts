import './helpers/env.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ToolConfigError,
  buildUrl,
  executeTool,
  validateHttpToolConfig,
  type HttpToolConfig,
  type RegisteredTool,
} from '../src/core/tools.js';

const http = (url: string, method: 'GET' | 'POST' = 'GET'): HttpToolConfig => ({ method, url });

const tool = (url: string): RegisteredTool => ({
  id: 't1',
  name: 'prueba',
  description: 'x',
  inputSchema: {},
  kind: 'http',
  config: http(url),
});

describe('validateHttpToolConfig — destinos rechazados', () => {
  // Una herramienta HTTP es "haz una petición con los parámetros que diga el
  // modelo", y el modelo obedece a cualquiera que escriba por Telegram. Esto se
  // valida al dar de alta, con un humano delante que puede corregirlo.
  const rechazos: Array<[string, string, string]> = [
    ['http sin cifrar', 'http://api.ejemplo.com/x', 'Solo se admite https'],
    ['marcador en el host', 'https://{{host}}.ejemplo.com/x', 'host no admite marcadores'],
    ['localhost', 'https://localhost/x', 'red interna'],
    ['loopback IPv4', 'https://127.0.0.1/x', 'red interna'],
    ['red privada 10/8', 'https://10.1.2.3/x', 'red interna'],
    ['red privada 192.168/16', 'https://192.168.0.1/x', 'red interna'],
    ['red privada 172.16/12', 'https://172.16.5.5/x', 'red interna'],
    ['metadatos de nube', 'https://169.254.169.254/latest/meta-data/', 'red interna'],
    ['CGNAT 100.64/10', 'https://100.64.0.1/x', 'red interna'],
    ['loopback IPv6', 'https://[::1]/x', 'red interna'],
    ['dominio .internal', 'https://db.internal/x', 'red interna'],
    ['URL sin sentido', 'no soy una url', 'no es una URL'],
  ];

  for (const [caso, url, fragmento] of rechazos) {
    it(`rechaza ${caso}`, () => {
      assert.throws(() => validateHttpToolConfig(http(url)), (err: unknown) => {
        assert.ok(err instanceof ToolConfigError);
        assert.match(err.message, new RegExp(fragmento));
        return true;
      });
    });
  }

  it('acepta https pública con marcadores en la ruta', () => {
    assert.doesNotThrow(() =>
      validateHttpToolConfig(http('https://api.ejemplo.com/precios/{{plan}}')),
    );
  });
});

describe('buildUrl — el origen no se puede mover', () => {
  it('sustituye y codifica los valores', () => {
    assert.equal(
      buildUrl('https://api.ejemplo.com/buscar/{{q}}', { q: 'hotel a&b' }),
      'https://api.ejemplo.com/buscar/hotel%20a%26b',
    );
  });

  it('un @ en un parámetro no convierte el host en userinfo', () => {
    // El clásico: https://api.ejemplo.com/@malicioso.com pasaría a tener
    // "api.ejemplo.com" como usuario y "malicioso.com" como host real.
    const url = buildUrl('https://api.ejemplo.com/{{p}}', { p: '@malicioso.com' });
    assert.equal(new URL(url).origin, 'https://api.ejemplo.com');
  });

  it('un // en un parámetro no redirige a otro servidor', () => {
    const url = buildUrl('https://api.ejemplo.com/{{p}}', { p: '//malicioso.com/x' });
    assert.equal(new URL(url).origin, 'https://api.ejemplo.com');
  });

  it('un ../ en un parámetro no se sale de la ruta', () => {
    const url = buildUrl('https://api.ejemplo.com/x/{{p}}', { p: '../../admin' });
    assert.ok(url.startsWith('https://api.ejemplo.com/x/'));
  });

  it('falla si falta un parámetro en vez de dejar el hueco', () => {
    assert.throws(() => buildUrl('https://api.ejemplo.com/{{a}}', {}), /Faltan par/);
  });
});

describe('executeTool — nunca lanza, siempre devuelve texto', () => {
  // Un fallo de herramienta no debe romper el turno: vuelve al modelo como
  // texto para que rectifique o se lo diga al usuario. Reventar la conversación
  // porque una API de terceros dio un 500 sería peor servicio.

  it('rechaza una dirección interna también en ejecución', async () => {
    // Segunda barrera: un nombre público puede resolver a una IP interna.
    const res = await executeTool(tool('https://127.0.0.1/secreto'), {}, { clientId: '00000000-0000-0000-0000-0000000000c1', runId: 'test-run' });
    assert.equal(res.isError, true);
    assert.match(res.content, /interna/);
  });

  it('devuelve el parámetro que falta como texto, no como excepción', async () => {
    const res = await executeTool(tool('https://api.ejemplo.com/{{q}}'), {}, { clientId: '00000000-0000-0000-0000-0000000000c1', runId: 'test-run' });
    assert.equal(res.isError, true);
    assert.match(res.content, /prueba/);
  });

  it('mide la latencia aunque falle', async () => {
    const res = await executeTool(tool('https://127.0.0.1/x'), {}, { clientId: '00000000-0000-0000-0000-0000000000c1', runId: 'test-run' });
    assert.ok(res.latencyMs >= 0);
  });
});
