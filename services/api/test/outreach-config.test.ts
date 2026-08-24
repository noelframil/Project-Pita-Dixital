import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

/**
 * Réplica exacta del ayudante de config.ts. Se prueba aquí en vez de importar
 * config.ts porque ese módulo valida el entorno y aborta el proceso al
 * importarse.
 */
const envBool = (def: boolean) =>
  z
    .enum(['true', 'false', '1', '0', 'yes', 'no'])
    .default(def ? 'true' : 'false')
    .transform((v) => v === 'true' || v === '1' || v === 'yes');

describe('booleanos de entorno — el interruptor no puede invertirse', () => {
  it('"false" es false, que es donde z.coerce.boolean se equivoca', () => {
    // Boolean("false") === true. Ese era el fallo: OUTREACH_LIVE=false
    // habilitaba el envío real.
    assert.equal(z.coerce.boolean().parse('false'), true, 'premisa del fallo');
    assert.equal(envBool(false).parse('false'), false);
  });

  it('acepta las formas habituales de decir sí y no', () => {
    for (const v of ['true', '1', 'yes']) assert.equal(envBool(false).parse(v), true, v);
    for (const v of ['false', '0', 'no']) assert.equal(envBool(true).parse(v), false, v);
  });

  it('sin valor usa el defecto', () => {
    assert.equal(envBool(false).parse(undefined), false);
    assert.equal(envBool(true).parse(undefined), true);
  });

  it('un valor raro falla en el arranque en vez de adivinar', () => {
    // Preferimos que el despliegue muera al arrancar a que alguien escriba
    // OUTREACH_LIVE=off y acabe enviando correo real.
    assert.throws(() => envBool(false).parse('off'));
    assert.throws(() => envBool(false).parse(''));
  });
});
