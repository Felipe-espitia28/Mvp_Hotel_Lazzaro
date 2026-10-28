import { codigoDesdeNombre } from './codigo';

describe('codigoDesdeNombre', () => {
  it('minúsculas, sin tildes y con guiones', () => {
    expect(codigoDesdeNombre('Masaje relajante 60 min')).toBe('masaje-relajante-60-min');
    expect(codigoDesdeNombre('Lavado de pantalón')).toBe('lavado-de-pantalon');
    expect(codigoDesdeNombre('Late check-out (hasta las 3 p. m.)')).toBe(
      'late-check-out-hasta-las-3-p-m',
    );
  });

  it('un nombre sin letras ni números da "servicio"', () => {
    expect(codigoDesdeNombre('¡¡!!')).toBe('servicio');
  });
});
