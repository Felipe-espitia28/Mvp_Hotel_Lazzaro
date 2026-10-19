import { describe, expect, it } from 'vitest';
import { aMesDia, diasDelMes, formatearMesDia, formatearRango } from './mesDia';

describe('fechas de temporada (mes·día)', () => {
  it('arma y muestra el mes y el día', () => {
    expect(aMesDia(12, 15)).toBe(1215);
    expect(formatearMesDia(1215)).toBe('15 dic');
    expect(formatearMesDia(105)).toBe('5 ene');
  });

  it('avisa cuando el rango cruza el fin de año', () => {
    expect(formatearRango(615, 715)).toBe('15 jun → 15 jul');
    expect(formatearRango(1215, 115)).toBe('15 dic → 15 ene (cruza el año)');
  });

  it('febrero admite el 29', () => {
    expect(diasDelMes(2)).toBe(29);
    expect(diasDelMes(4)).toBe(30);
  });
});
