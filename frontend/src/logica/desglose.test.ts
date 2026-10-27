import { describe, expect, it } from 'vitest';
import type { Desglose } from '../api/types';
import { agruparNoches, lineasDeHuespedes } from './desglose';

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

describe('líneas por las personas (A-3)', () => {
  const tresNoches = [
    noche('2030-03-10', 'baja', 100000),
    noche('2030-03-11', 'baja', 100000),
    noche('2030-03-12', 'baja', 100000),
  ];

  it('muestra los adultos adicionales, los niños gratis y los niños con cargo', () => {
    const lineas = lineasDeHuespedes({
      ...desglose(tresNoches),
      personasAdicionales: 1,
      cargoPersonaAdicionalPorNoche: 40000,
      adicionales: 120000,
      ninos: { gratis: 2, conCargo: 1 },
      cargoNinoPorNoche: 20000,
      ninosAdicionales: 60000,
    });

    expect(lineas).toEqual([
      { concepto: '1 persona adicional × 3 noches', unitario: 40000, valor: 120000 },
      { concepto: '2 niños gratis', unitario: null, valor: 0 },
      { concepto: '1 niño × 3 noches', unitario: 20000, valor: 60000 },
    ]);
  });

  it('un desglose antiguo, sin campos de niños, solo muestra los adicionales', () => {
    const antiguo = {
      ...desglose(tresNoches),
      personasAdicionales: 2,
      cargoPersonaAdicionalPorNoche: 30000,
      adicionales: 180000,
    };
    expect(lineasDeHuespedes(antiguo)).toEqual([
      { concepto: '2 personas adicionales × 3 noches', unitario: 30000, valor: 180000 },
    ]);
    expect(lineasDeHuespedes(desglose(tresNoches))).toEqual([]);
  });
});
