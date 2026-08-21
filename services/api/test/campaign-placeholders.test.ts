import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * El compositor sustituye los marcadores que conoce y deja vacíos los demás,
 * sin avisar. Un {{motivo}} no conectado no rompe nada: deja un hueco en
 * blanco justo donde iba la razón de escribir, en todos los correos.
 */
const CONOCIDOS = new Set(['first_name', 'full_name', 'organisation', 'role_title', 'motivo']);
const marcadores = (t: string) =>
  [...t.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]!);

describe('marcadores de plantilla', () => {
  it('la plantilla por operación solo usa marcadores conectados', () => {
    const plantilla = `{{first_name}},\n\n{{motivo}}\n\nDatos.\n\n¿Le envío el perfil ciego?`;
    for (const m of marcadores(plantilla)) {
      assert.ok(CONOCIDOS.has(m), `marcador sin conectar: {{${m}}}`);
    }
  });

  it('detecta un marcador inventado', () => {
    assert.deepEqual(marcadores('Hola {{nombre_pila}}'), ['nombre_pila']);
    assert.ok(!CONOCIDOS.has('nombre_pila'));
  });

  it('el compositor deja vacío lo que no conoce, no lo señala', () => {
    const compose = (t: string, v: Record<string, string>) =>
      t.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) => v[k] ?? '');
    // Este es el modo de fallo exacto: sale un hueco, no un error.
    assert.equal(compose('A {{desconocido}} B', {}), 'A  B');
  });
});
