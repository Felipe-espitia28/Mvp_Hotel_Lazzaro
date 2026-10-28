import { NitInvalidoError, digitoVerificacion, normalizarNit } from './nit';

describe('NIT (DIAN)', () => {
  it('calcula el dígito de verificación', () => {
    expect(digitoVerificacion('800197268')).toBe('4'); // DIAN
    expect(digitoVerificacion('890903938')).toBe('8');
    expect(digitoVerificacion('900123456')).toBe('8');
  });

  it('normaliza las formas en que se escribe el mismo NIT', () => {
    const esperado = { nit: '900123456', digitoVerificacion: '8' };
    expect(normalizarNit('900.123.456-8')).toEqual(esperado);
    expect(normalizarNit(' 900123456-8 ')).toEqual(esperado);
    expect(normalizarNit('9001234568')).toEqual(esperado);
    expect(normalizarNit('900123456')).toEqual(esperado);
  });

  it('rechaza un dígito de verificación que no cuadra o un NIT con letras', () => {
    expect(() => normalizarNit('900.123.456-7')).toThrow(NitInvalidoError);
    expect(() => normalizarNit('9001234567')).toThrow(/es 8, no 7/);
    expect(() => normalizarNit('ABC123')).toThrow(NitInvalidoError);
  });
});
