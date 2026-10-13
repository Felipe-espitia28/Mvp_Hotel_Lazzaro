import { describe, expect, it } from 'vitest';
import type { Desglose } from '../api/types';
import { agruparNoches } from './desglose';

const noche = (
  fecha: string,
  temporada: 'baja' | 'media' | 'alta',
  tarifa: number,
  motivo: string | null = null,
) => ({
  fecha,
  temporada,
  motivo,
  tarifa,
});

const desglose = (noches: ReturnType<typeof noche>[]): Desglose => ({
  noches,
  huespedes: 2,
  personasAdicionales: 0,
  cargoPersonaAdicionalPorNoche: 0,
  alojamiento: 0,
  adicionales: 0,
  subtotal: 0,
  iva: { porcentaje: 19, valor: 0, exento: false },
  total: 0,
});

describe('agrupado del desglose', () => {
  it('junta noches consecutivas con la misma tarifa y motivo', () => {
    const grupos = agruparNoches(
      desglose([
        noche('2026-10-11', 'media', 149500, 'Puente festivo: Día de la Raza'),
        noche('2026-10-12', 'baja', 130000),
        noche('2026-10-13', 'baja', 130000),
      ]),
    );

    expect(grupos.map((g) => [g.desde, g.temporada, g.noches, g.tarifa])).toEqual([
      ['2026-10-11', 'media', 1, 149500],
      ['2026-10-12', 'baja', 2, 130000],
    ]);
  });

  it('separa dos puentes distintos aunque tengan la misma tarifa', () => {
    const grupos = agruparNoches(
      desglose([
        noche('2026-11-01', 'media', 115000, 'Puente festivo: Todos los Santos'),
        noche('2026-11-02', 'media', 115000, 'Puente festivo: Otro'),
      ]),
    );
    expect(grupos).toHaveLength(2);
  });

  it('un desglose sin noches no produce líneas', () => {
    expect(agruparNoches(desglose([]))).toEqual([]);
  });
});
