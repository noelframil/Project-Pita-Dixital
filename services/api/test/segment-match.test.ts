import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Réplica de la normalización que hace la consulta de campañas. Se prueba
 * aparte porque el fallo era invisible: la campaña decía "0 candidatos" sin
 * error, como si simplemente no hubiera nadie en ese segmento.
 */
const norm = (s: string) => s.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();

describe('cruce de segmentos entre campañas y prospectos', () => {
  it('el nombre del vertical cruza con el slug del CLI', () => {
    assert.equal(norm('Agroindustria'), norm('agroindustria'));
    assert.equal(norm('Hotelero'), norm('hotelero'));
    assert.equal(norm('Inmobiliario'), norm('inmobiliario'));
  });

  it('cruza el vertical con ampersand y espacios', () => {
    // Este es el que más fácil se rompe: "M&A y situaciones especiales".
    assert.equal(norm('M&A y situaciones especiales'), norm('m-a-y-situaciones-especiales'));
  });

  it('cruza "Mandatos de compra" con su slug', () => {
    assert.equal(norm('Mandatos de compra'), norm('mandatos-de-compra'));
    assert.equal(norm('Levantamiento de capital'), norm('levantamiento-de-capital'));
  });

  it('no cruza verticales distintos', () => {
    assert.notEqual(norm('Hotelero'), norm('inmobiliario'));
    assert.notEqual(norm('Agroindustria'), norm('agro'));
  });
});
