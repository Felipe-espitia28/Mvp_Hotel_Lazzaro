import { describe, expect, it } from 'vitest';
import { diasEntre, sumarDias, ubicar } from './calendario';

describe('calendario de ocupación', () => {
  it('suma días cruzando mes y año', () => {
    expect(sumarDias('2026-12-30', 3)).toBe('2027-01-02');
    expect(sumarDias('2028-02-28', 1)).toBe('2028-02-29'); // bisiesto
    expect(diasEntre('2026-10-09', '2026-10-23')).toBe(14);
  });

  // Rango visible: 14 días desde el 9 de octubre (columnas 2 a 15).
  const desde = '2026-10-09';

  it('una reserva dentro del rango ocupa una columna por noche', () => {
    // 19 → 22: noches del 19, 20 y 21 (el día de salida queda libre).
    expect(ubicar({ fechaEntrada: '2026-10-19', fechaSalida: '2026-10-22' }, desde, 14)).toEqual({
      columna: '12 / 15',
      sigueAntes: false,
      sigueDespues: false,
    });
  });

  it('recorta la barra de una reserva que empezó antes del rango', () => {
    expect(ubicar({ fechaEntrada: '2026-10-07', fechaSalida: '2026-10-11' }, desde, 14)).toEqual({
      columna: '2 / 4',
      sigueAntes: true,
      sigueDespues: false,
    });
  });

  it('recorta la barra de una reserva que termina después del rango', () => {
    expect(ubicar({ fechaEntrada: '2026-10-20', fechaSalida: '2026-10-30' }, desde, 14)).toEqual({
      columna: '13 / 16',
      sigueAntes: false,
      sigueDespues: true,
    });
  });

  it('una reserva que cubre todo el rango sigue por ambos lados', () => {
    const { columna, sigueAntes, sigueDespues } = ubicar(
      { fechaEntrada: '2026-10-01', fechaSalida: '2026-10-31' },
      desde,
      14,
    );
    expect([columna, sigueAntes, sigueDespues]).toEqual(['2 / 16', true, true]);
  });
});
