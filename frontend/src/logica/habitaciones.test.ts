import { describe, expect, it } from 'vitest';
import { numerosDelRango, pisosPresentes } from './habitaciones';

describe('habitaciones en lote', () => {
  it('arma el rango con el prefijo y los ceros de "desde"', () => {
    expect(numerosDelRango('101', '103')).toEqual(['101', '102', '103']);
    expect(numerosDelRango('08', '10', 'C-')).toEqual(['C-08', 'C-09', 'C-10']);
    expect(numerosDelRango('120', '101')).toEqual([]);
    expect(numerosDelRango('a', '3')).toEqual([]);
  });

  it('lista los pisos con habitaciones, sin repetir y en orden', () => {
    expect(pisosPresentes([{ piso: 2 }, { piso: null }, { piso: 1 }, { piso: 2 }])).toEqual([1, 2]);
  });
});
