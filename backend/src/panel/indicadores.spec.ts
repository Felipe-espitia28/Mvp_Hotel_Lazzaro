// Pruebas unitarias de los indicadores del panel (B-1): sin base de datos.
import { Desglose, recortarDesglose } from '../tarifas/motor-tarificacion';
import {
  ReservaDelRango,
  calcularIndicadores,
  ingresoPorNoche,
  periodoAnterior,
  resumenPickup,
  variacion,
} from './indicadores';

const d = (iso: string) => new Date(iso);
const iso = (fecha: Date) => fecha.toISOString().slice(0, 10);

// Desglose de una estadía con tarifas por noche dadas y, si se pide, un adulto
// adicional (cargo por noche) e IVA del 19 %.
function desglose(
  entrada: string,
  tarifas: number[],
  { adicional = 0, iva = 19 }: { adicional?: number; iva?: number } = {},
): Desglose {
  const noches = tarifas.map((tarifa, i) => ({
    fecha: iso(new Date(d(entrada).getTime() + i * 86400000)),
    temporada: 'baja' as const,
    motivo: null,
    tarifa,
  }));
  const alojamiento = tarifas.reduce((s, t) => s + t, 0);
  const adicionales = (adicional ? 1 : 0) * adicional * noches.length;
  const subtotal = alojamiento + adicionales;
  const valor = Math.round((subtotal * iva) / 100);
  return {
    noches,
    huespedes: adicional ? 3 : 2,
    adultos: adicional ? 3 : 2,
    ninos: { gratis: 0, conCargo: 0 },
    personasAdicionales: adicional ? 1 : 0,
    cargoPersonaAdicionalPorNoche: adicional,
    cargoNinoPorNoche: 0,
    alojamiento,
    adicionales,
    ninosAdicionales: 0,
    subtotal,
    iva: { porcentaje: iva, valor, exento: iva === 0 },
    total: subtotal + valor,
  };
}

function reserva(
  estado: string,
  entrada: string,
  salida: string,
  extra: Partial<ReservaDelRango> = {},
): ReservaDelRango {
  return {
    estado,
    fechaEntrada: d(entrada),
    fechaSalida: d(salida),
    valorAlojamiento: 0,
    total: null,
    desglose: null,
    ...extra,
  };
}

const habitaciones = (cuantas: number, fueraDeServicio = 0) =>
  Array.from({ length: cuantas }, (_, i) => ({
    id: `h${i}`,
    estado: i < fueraDeServicio ? 'fuera_servicio' : 'libre',
  }));

describe('Indicadores del panel', () => {
  // Caso armado a mano. Período del 1 al 5 de marzo (5 noches), 10
  // habitaciones con una fuera de servicio:
  //   disponibles = 9 × 5 = 45 noches.
  // A: 1→4 mar, 3 noches de $100.000 con IVA 19 % (el IVA no cuenta):
  //    3 noches, $300.000.
  // B: 4→8 mar, $80.000 + $20.000 de un adulto adicional por noche: dentro
  //    del período solo el 4 y el 5 → 2 noches, $200.000.
  // C: cancelada con penalidad de $80.000: no vende noches.
  //   vendidas = 5; ingreso de alojamiento = $500.000
  //   ocupación = 5 ÷ 45 = 11,1 %
  //   ADR = 500.000 ÷ 5 = $100.000
  //   RevPAR = 500.000 ÷ 45 = $11.111 (= ADR × ocupación)
  const caso = () =>
    calcularIndicadores({
      habitaciones: habitaciones(10, 1),
      reservas: [
        reserva('cerrada', '2030-03-01', '2030-03-04', {
          desglose: desglose('2030-03-01', [100000, 100000, 100000]),
        }),
        reserva('confirmada', '2030-03-04', '2030-03-08', {
          desglose: desglose('2030-03-04', [80000, 80000, 80000, 80000], { adicional: 20000 }),
        }),
        reserva('cancelada', '2030-03-02', '2030-03-05', { total: 80000 }),
      ],
      cargos: [],
      desde: d('2030-03-01'),
      hasta: d('2030-03-05'),
    });

  it('calcula ocupación, ADR y RevPAR exactos del caso armado a mano', () => {
    const r = caso();
    expect(r.nochesDisponibles).toBe(45);
    expect(r.nochesVendidas).toBe(5);
    expect(r.ingresoAlojamiento).toBe(500000);
    expect(r.ocupacion).toBe(11.1);
    expect(r.adr).toBe(100000);
    expect(r.revpar).toBe(11111);
    expect(r.cancelaciones).toEqual({ cuantas: 1, penalidad: 80000 });
    expect(r.noShows).toEqual({ cuantas: 0, penalidad: 0 });
    expect(r.ingresoTotal).toBe(580000);
  });

  it('arma la serie diaria con las noches ocupadas y el ingreso', () => {
    expect(caso().serie.map((n) => [n.fecha, n.ocupadas, n.total, n.ingreso])).toEqual([
      ['2030-03-01', 1, 9, 100000],
      ['2030-03-02', 1, 9, 100000],
      ['2030-03-03', 1, 9, 100000],
      ['2030-03-04', 1, 9, 100000],
      ['2030-03-05', 1, 9, 100000],
    ]);
  });

  it('una estadía que cruza el fin de mes reparte sus noches', () => {
    const estadia = reserva('cerrada', '2030-01-30', '2030-02-02', {
      desglose: desglose('2030-01-30', [100000, 110000, 120000]),
    });
    const del = (desde: string, hasta: string) =>
      calcularIndicadores({
        habitaciones: habitaciones(1),
        reservas: [estadia],
        cargos: [],
        desde: d(desde),
        hasta: d(hasta),
      });
    const enero = del('2030-01-01', '2030-01-31');
    const febrero = del('2030-02-01', '2030-02-28');
    expect([enero.nochesVendidas, enero.ingresoAlojamiento]).toEqual([2, 210000]);
    expect([febrero.nochesVendidas, febrero.ingresoAlojamiento]).toEqual([1, 120000]);
  });

  it('el IVA no entra en el ADR', () => {
    const conIva = desglose('2030-03-01', [100000], { iva: 19 });
    const sinIva = desglose('2030-03-01', [100000], { iva: 0 });
    const adr = (des: Desglose) =>
      calcularIndicadores({
        habitaciones: habitaciones(1),
        reservas: [reserva('confirmada', '2030-03-01', '2030-03-02', { desglose: des })],
        cargos: [],
        desde: d('2030-03-01'),
        hasta: d('2030-03-01'),
      }).adr;
    expect(adr(conIva)).toBe(100000);
    expect(adr(sinIva)).toBe(100000);
  });

  it('una salida anticipada cuenta solo las noches del desglose recortado', () => {
    // Pactó 4 noches y se fue después de 2: el check-out deja la salida y el
    // desglose recortados.
    const recortado = recortarDesglose(desglose('2030-03-01', [100000, 100000, 100000, 100000]), 2);
    const r = calcularIndicadores({
      habitaciones: habitaciones(2),
      reservas: [reserva('cerrada', '2030-03-01', '2030-03-03', { desglose: recortado })],
      cargos: [],
      desde: d('2030-03-01'),
      hasta: d('2030-03-05'),
    });
    expect([r.nochesVendidas, r.ingresoAlojamiento]).toEqual([2, 200000]);
  });

  it('sin desglose (reservas antiguas) reparte el alojamiento en partes iguales', () => {
    const noches = ingresoPorNoche(
      reserva('cerrada', '2030-03-01', '2030-03-04', { valorAlojamiento: 300000 }),
    );
    expect([...noches]).toEqual([
      ['2030-03-01', 100000],
      ['2030-03-02', 100000],
      ['2030-03-03', 100000],
    ]);
  });

  it('suma los consumos de los días del rango por clasificación', () => {
    const r = calcularIndicadores({
      habitaciones: habitaciones(1),
      reservas: [],
      cargos: [
        { categoria: 'minibar', total: 10000, fecha: d('2030-03-01T15:00:00-05:00') },
        { categoria: 'spa', total: 90000, fecha: d('2030-03-02T10:00:00-05:00') },
        { categoria: 'minibar', total: 5000, fecha: d('2030-03-02T20:00:00-05:00') },
        // A las 21:00 del 5 en Colombia ya es el 6 en UTC: cuenta el día del hotel.
        { categoria: 'spa', total: 1000, fecha: d('2030-03-05T21:00:00-05:00') },
        { categoria: 'spa', total: 7000, fecha: d('2030-03-06T09:00:00-05:00') }, // fuera
      ],
      desde: d('2030-03-01'),
      hasta: d('2030-03-05'),
    });
    expect(r.consumosPorClasificacion).toEqual([
      { clasificacion: 'spa', total: 91000 },
      { clasificacion: 'minibar', total: 15000 },
    ]);
    expect(r.ingresoConsumos).toBe(106000);
  });

  it('compara con el período anterior de la misma duración', () => {
    const anterior = periodoAnterior(d('2030-03-01'), d('2030-03-05'));
    expect([iso(anterior.desde), iso(anterior.hasta)]).toEqual(['2030-02-24', '2030-02-28']);

    const actual = caso();
    const vacio = calcularIndicadores({
      habitaciones: habitaciones(10, 1),
      reservas: [],
      cargos: [],
      desde: anterior.desde,
      hasta: anterior.hasta,
    });
    // Sin datos antes, no hay porcentaje con qué comparar.
    expect(variacion(actual, vacio)).toEqual({
      ocupacion: null,
      adr: null,
      revpar: null,
      ingresoTotal: null,
    });
    // Ingreso total de $580.000 frente a $290.000: +100 %.
    expect(variacion(actual, { ...actual, ingresoTotal: 290000 }).ingresoTotal).toBe(100);
  });

  it('el pickup cuenta las creadas, sus noches e ingreso, y las ya canceladas', () => {
    expect(
      resumenPickup([
        reserva('confirmada', '2030-05-01', '2030-05-03', {
          desglose: desglose('2030-05-01', [100000, 100000]),
        }),
        reserva('cancelada', '2030-06-01', '2030-06-05', { total: 0 }),
      ]),
    ).toEqual({ reservas: 2, canceladas: 1, noches: 2, ingreso: 200000 });
  });
});
