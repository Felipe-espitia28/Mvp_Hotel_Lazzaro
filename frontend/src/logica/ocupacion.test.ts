import { describe, expect, it } from 'vitest';
import { ocupacionPorNoche } from './ocupacion';

const habitaciones = [
  { id: 'h1', estado: 'libre' },
  { id: 'h2', estado: 'ocupada' },
  { id: 'h3', estado: 'en_limpieza' },
  { id: 'h4', estado: 'fuera_servicio' },
];

const reserva = (habitacionId: string, entrada: string, salida: string, estado = 'confirmada') => ({
  habitacionId,
  fechaEntrada: `${entrada}T00:00:00.000Z`,
  fechaSalida: `${salida}T00:00:00.000Z`,
  estado,
});

describe('ocupación por noche', () => {
  it('cuenta las noches de cada reserva; el día de salida queda libre', () => {
    const noches = ocupacionPorNoche(
      habitaciones,
      [
        reserva('h1', '2026-10-12', '2026-10-14'),
        reserva('h2', '2026-10-10', '2026-10-13', 'activa'),
      ],
      '2026-10-12',
      3,
    );

    expect(noches.map((n) => [n.fecha, n.ocupadas])).toEqual([
      ['2026-10-12', 2],
      ['2026-10-13', 1],
      ['2026-10-14', 0],
    ]);
  });

  it('calcula el porcentaje sobre las habitaciones en servicio', () => {
    const [noche] = ocupacionPorNoche(
      habitaciones,
      [reserva('h1', '2026-10-12', '2026-10-13')],
      '2026-10-12',
      1,
    );
    // 3 en servicio (la h4 está fuera de servicio).
    expect(noche).toEqual({ fecha: '2026-10-12', ocupadas: 1, total: 3, porcentaje: 33 });
  });

  it('ignora reservas cerradas, canceladas y de habitaciones fuera de servicio', () => {
    const [noche] = ocupacionPorNoche(
      habitaciones,
      [
        reserva('h1', '2026-10-12', '2026-10-13', 'cancelada'),
        reserva('h2', '2026-10-12', '2026-10-13', 'cerrada'),
        reserva('h4', '2026-10-12', '2026-10-13'),
      ],
      '2026-10-12',
      1,
    );
    expect(noche.ocupadas).toBe(0);
  });

  it('sin habitaciones en servicio la ocupación es 0 %', () => {
    const [noche] = ocupacionPorNoche([], [], '2026-10-12', 1);
    expect(noche.porcentaje).toBe(0);
  });
});
