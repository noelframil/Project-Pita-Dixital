import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { datoDuroDe } from '../src/outreach/subject.js';

/**
 * Un número equivocado en el asunto de un correo a un director de inversiones
 * no es un detalle: es la credibilidad de la firma en la primera línea.
 */
describe('dato duro para el asunto', () => {
  it('no confunde "habitaciones" con hectáreas', () => {
    const d = 'Dos proyectos hoteleros llave en mano en Madrid, de 88 y 52 habitaciones, con entregas en 2027.';
    assert.equal(datoDuroDe(d), '88 y 52 habitaciones');
  });

  it('mantiene juntas las dos cifras de habitaciones', () => {
    assert.match(datoDuroDe('de 88 y 52 habitaciones')!, /88 y 52/);
  });

  it('en compraventa de empresa manda el EBITDA, no los metros', () => {
    const d = 'Facturación ~4,1 M€, EBITDA ~1,1 M€ (margen ~27%), parcela urbana ~2.700 m² y ~1.000 m² construidos.';
    assert.equal(datoDuroDe(d), 'EBITDA ~1,1 M€');
  });

  it('entiende el umbral de un mandato de compra', () => {
    const d = 'Búsqueda nacional de centros médicos con EBITDA superior a 300.000 €.';
    assert.equal(datoDuroDe(d), 'EBITDA >300.000 €');
  });

  it('saca hectáreas cuando de verdad son hectáreas', () => {
    assert.equal(datoDuroDe('Finca de 330 hectáreas en Jaén.'), '330 hectáreas');
    assert.equal(datoDuroDe('Corredor de 1.212 ha en regadío.'), '1.212 ha');
  });

  it('devuelve null si no hay cifra, en vez de inventarse una', () => {
    assert.equal(datoDuroDe('Carta de intenciones y dossier elaborados; en negociación.'), null);
  });
});
