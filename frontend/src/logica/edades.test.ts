import { describe, expect, it } from 'vitest';
import { resumenHuespedes, resumenRangos } from './edades';

describe('rangos de edad del hotel (A-3)', () => {
  it('muestra el ejemplo con los valores por defecto', () => {
    expect(resumenRangos(4, 11)).toBe('0–4 gratis · 5–11 tarifa de niño · 12+ adulto');
  });

  it('sin tarifa de niño, se pasa de gratis a adulto', () => {
    expect(resumenRangos(5, 5)).toBe('0–5 gratis · 6+ adulto');
  });

  it('una sola edad con tarifa de niño', () => {
    expect(resumenRangos(4, 5)).toBe('0–4 gratis · 5 tarifa de niño · 6+ adulto');
  });
});

describe('huéspedes de una reserva', () => {
  it('solo adultos', () => {
    expect(resumenHuespedes(1, [])).toBe('1 adulto');
    expect(resumenHuespedes(3, [])).toBe('3 adultos');
  });

  it('adultos y niños, con sus edades en orden', () => {
    expect(resumenHuespedes(2, [8, 3])).toBe('2 adultos y 2 niños (3 y 8 años)');
    expect(resumenHuespedes(1, [1])).toBe('1 adulto y 1 niño (1 año)');
    expect(resumenHuespedes(2, [9, 2, 5])).toBe('2 adultos y 3 niños (2, 5 y 9 años)');
  });
});
