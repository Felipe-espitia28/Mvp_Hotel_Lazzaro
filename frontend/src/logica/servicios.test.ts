import { describe, expect, it } from 'vitest';
import { camposDelTipo, codigoDesdeNombre, leerEdades, precioEstimado } from './servicios';

const RANGOS = { gratisHasta: 4, ninoHasta: 11 };

describe('catálogo de servicios', () => {
  it('cada tipo muestra solo sus campos', () => {
    expect(camposDelTipo('consumo')).toEqual({ duracion: false, cupos: false });
    expect(camposDelTipo('cita')).toEqual({ duracion: true, cupos: false });
    expect(camposDelTipo('experiencia')).toEqual({ duracion: true, cupos: true });
  });

  it('sugiere el código como el backend', () => {
    expect(codigoDesdeNombre('Masaje relajante 60 min')).toBe('masaje-relajante-60-min');
    expect(codigoDesdeNombre('Lavado de pantalón')).toBe('lavado-de-pantalon');
  });

  it('lee las edades de los niños', () => {
    expect(leerEdades('3, 8')).toEqual([3, 8]);
    expect(leerEdades('  ')).toEqual([]);
    expect(leerEdades('3, ocho')).toBeNull();
    expect(leerEdades('18')).toBeNull();
  });

  it('estima el total: fijo, por persona y por edad con un niño gratis', () => {
    const quienes = { cantidad: 3, adultos: 2, edadesNinos: [3, 8, 14] };
    expect(
      precioEstimado({ modoPrecio: 'fijo', precio: '6000', precioNino: null }, quienes, RANGOS),
    ).toBe(18000);
    expect(
      precioEstimado(
        { modoPrecio: 'por_persona', precio: '120000', precioNino: null },
        quienes,
        RANGOS,
      ),
    ).toBe(360000);
    // 3 años gratis, 8 niño, 14 como adulto.
    expect(
      precioEstimado(
        { modoPrecio: 'por_edad', precio: '90000', precioNino: '45000' },
        quienes,
        RANGOS,
      ),
    ).toBe(315000);
  });
});
