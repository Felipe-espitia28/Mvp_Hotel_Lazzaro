import { describe, expect, it } from 'vitest';
import { diferenciaCaja, leerMonto } from './caja';

describe('caja', () => {
  it('la diferencia es lo contado menos lo esperado', () => {
    expect(diferenciaCaja(210000, 220000)).toEqual({
      diferencia: -10000,
      tono: 'descuadre',
      texto: 'Falta dinero en la caja',
    });
    expect(diferenciaCaja(220000, 220000)?.tono).toBe('cuadra');
    expect(diferenciaCaja(230000, 220000)?.texto).toBe('Sobra dinero en la caja');
  });

  it('sin lo contado no hay diferencia que mostrar', () => {
    expect(diferenciaCaja(null, 220000)).toBeNull();
  });

  it('lee los montos como se escriben en Colombia', () => {
    expect(leerMonto('210.000')).toBe(210000);
    expect(leerMonto('$ 210.000')).toBe(210000);
    expect(leerMonto('1500,50')).toBe(1500.5);
    expect(leerMonto('abc')).toBeNull();
    expect(leerMonto('')).toBeNull();
  });
});
