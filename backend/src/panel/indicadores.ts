// B-1: indicadores del negocio (ocupación, ADR, RevPAR, ingresos). Función
// pura: recibe las habitaciones, las reservas y los cargos del rango y
// devuelve los indicadores, para probarla sin base de datos. Con 10 a 80
// habitaciones un año son a lo sumo unas 30.000 noches: se calcula sobre las
// tablas actuales, sin tablas precalculadas.
//
// Definiciones:
// - Habitaciones disponibles de una noche: las habitaciones del hotel menos
//   las que están fuera de servicio esa noche. Como no hay histórico de
//   estados, se usa el estado actual para todo el período (limitación).
// - Noche vendida: una noche de una reserva confirmada, activa o cerrada (las
//   canceladas y los no-shows no cuentan).
// - Ingreso de alojamiento: la suma de las tarifas por noche del desglose
//   congelado (noches[].tarifa, más las personas y los niños adicionales), sin
//   IVA ni consumos. Para las reservas cerradas con salida anticipada se usa el
//   desglose recortado (el check-out ya lo deja guardado así).
// - Ocupación = noches vendidas ÷ noches disponibles.
// - ADR (tarifa media) = ingreso de alojamiento ÷ noches vendidas.
// - RevPAR (ingreso por habitación disponible) = ingreso de alojamiento ÷
//   noches disponibles = ADR × ocupación.
// - Pickup de N días = reservas creadas en los últimos N días (cuántas, sus
//   noches y su ingreso), sin importar la fecha de la estadía.
// - Los ingresos se atribuyen por noche (la noche del 31 cuenta en ese mes),
//   no por la fecha de salida.
import { contarNoches, fechaDelHotel, sumarDias } from '../hotel/politicas';
import { Desglose } from '../tarifas/motor-tarificacion';

export interface HabitacionDelRango {
  id: string;
  estado: string;
}

export interface ReservaDelRango {
  estado: string;
  fechaEntrada: Date;
  fechaSalida: Date;
  valorAlojamiento: number;
  // Lo liquidado (cerrada) o la penalidad (cancelada, no-show); null si no se ha liquidado.
  total: number | null;
  desglose: Desglose | null;
}

export interface CargoDelRango {
  categoria: string;
  total: number;
  fecha: Date; // instante del cargo
}

export interface NocheDeLaSerie {
  fecha: string; // YYYY-MM-DD
  ocupadas: number;
  total: number; // habitaciones disponibles
  porcentaje: number; // 0–100, redondeado (como el gráfico del panel)
  ingreso: number; // ingreso de alojamiento de esa noche
}

const VENDIDAS = ['confirmada', 'activa', 'cerrada'];
const dia = (fecha: Date) => fecha.toISOString().slice(0, 10);
const pesos = (valor: number) => Math.round(valor);
const unDecimal = (valor: number) => Math.round(valor * 10) / 10;

// Ingreso de alojamiento de cada noche de la reserva (fecha → pesos, sin IVA).
// Las reservas anteriores al motor de tarifas no tienen desglose: se reparte
// el valor del alojamiento en partes iguales.
export function ingresoPorNoche(reserva: ReservaDelRango): Map<string, number> {
  const entrada = dia(reserva.fechaEntrada);
  const salida = dia(reserva.fechaSalida);
  const { desglose } = reserva;
  if (!desglose) {
    const noches = contarNoches(reserva.fechaEntrada, reserva.fechaSalida);
    return new Map(
      Array.from({ length: noches }, (_, i) => [
        dia(sumarDias(reserva.fechaEntrada, i)),
        reserva.valorAlojamiento / noches,
      ]),
    );
  }
  const adicionalesPorNoche =
    desglose.personasAdicionales * desglose.cargoPersonaAdicionalPorNoche +
    (desglose.ninos?.conCargo ?? 0) * (desglose.cargoNinoPorNoche ?? 0);
  return new Map(
    desglose.noches
      .filter((n) => n.fecha >= entrada && n.fecha < salida)
      .map((n) => [n.fecha, n.tarifa + adicionalesPorNoche]),
  );
}

// Los días [desde, hasta], ambos incluidos.
export function diasDelRango(desde: Date, hasta: Date) {
  return Array.from({ length: contarNoches(desde, hasta) + 1 }, (_, i) => dia(sumarDias(desde, i)));
}

// El período anterior de la misma duración, para comparar.
export function periodoAnterior(desde: Date, hasta: Date) {
  const dias = contarNoches(desde, hasta) + 1;
  return { desde: sumarDias(desde, -dias), hasta: sumarDias(desde, -1) };
}

export function calcularIndicadores({
  habitaciones,
  reservas,
  cargos,
  desde,
  hasta,
}: {
  habitaciones: HabitacionDelRango[];
  reservas: ReservaDelRango[];
  cargos: CargoDelRango[];
  desde: Date;
  hasta: Date;
}) {
  const dias = diasDelRango(desde, hasta);
  const primero = dias[0];
  const ultimo = dias[dias.length - 1];
  const disponiblesPorNoche = habitaciones.filter((h) => h.estado !== 'fuera_servicio').length;

  // Noches vendidas e ingreso de alojamiento, noche por noche.
  const porNoche = new Map(dias.map((d) => [d, { ocupadas: 0, ingreso: 0 }]));
  for (const reserva of reservas.filter((r) => VENDIDAS.includes(r.estado))) {
    for (const [fecha, ingreso] of ingresoPorNoche(reserva)) {
      const noche = porNoche.get(fecha);
      if (!noche) continue; // fuera del rango
      noche.ocupadas += 1;
      noche.ingreso += ingreso;
    }
  }
  const serie: NocheDeLaSerie[] = dias.map((fecha) => {
    const { ocupadas, ingreso } = porNoche.get(fecha)!;
    return {
      fecha,
      ocupadas,
      total: disponiblesPorNoche,
      porcentaje: disponiblesPorNoche ? Math.round((ocupadas / disponiblesPorNoche) * 100) : 0,
      ingreso: pesos(ingreso),
    };
  });

  const nochesDisponibles = disponiblesPorNoche * dias.length;
  const nochesVendidas = serie.reduce((s, n) => s + n.ocupadas, 0);
  const ingresoAlojamiento = pesos([...porNoche.values()].reduce((s, n) => s + n.ingreso, 0));

  // Consumos: los cargos de los días del rango, por clasificación contable.
  const consumos = new Map<string, number>();
  for (const cargo of cargos) {
    const fecha = dia(fechaDelHotel(cargo.fecha));
    if (fecha < primero || fecha > ultimo) continue;
    consumos.set(cargo.categoria, (consumos.get(cargo.categoria) ?? 0) + cargo.total);
  }
  const consumosPorClasificacion = [...consumos]
    .map(([clasificacion, total]) => ({ clasificacion, total: pesos(total) }))
    .sort((a, b) => b.total - a.total);
  const ingresoConsumos = consumosPorClasificacion.reduce((s, c) => s + c.total, 0);

  // Cancelaciones y no-shows de las llegadas del rango, con su penalidad.
  const terminadas = (estado: string) => {
    const lista = reservas.filter((r) => {
      const entrada = dia(r.fechaEntrada);
      return r.estado === estado && entrada >= primero && entrada <= ultimo;
    });
    return {
      cuantas: lista.length,
      penalidad: pesos(lista.reduce((s, r) => s + (r.total ?? 0), 0)),
    };
  };
  const cancelaciones = terminadas('cancelada');
  const noShows = terminadas('no_show');

  return {
    nochesDisponibles,
    nochesVendidas,
    ocupacion: nochesDisponibles ? unDecimal((nochesVendidas / nochesDisponibles) * 100) : 0,
    adr: nochesVendidas ? pesos(ingresoAlojamiento / nochesVendidas) : 0,
    revpar: nochesDisponibles ? pesos(ingresoAlojamiento / nochesDisponibles) : 0,
    ingresoAlojamiento,
    ingresoConsumos,
    consumosPorClasificacion,
    cancelaciones,
    noShows,
    ingresoTotal:
      ingresoAlojamiento + ingresoConsumos + cancelaciones.penalidad + noShows.penalidad,
    serie,
  };
}

export type Indicadores = ReturnType<typeof calcularIndicadores>;

// Cuánto cambió cada indicador frente al período anterior, en %; null si el
// anterior es 0 (no hay con qué comparar).
export function variacion(actual: Indicadores, anterior: Indicadores) {
  const cambio = (a: number, b: number) => (b ? unDecimal(((a - b) / b) * 100) : null);
  return {
    ocupacion: cambio(actual.ocupacion, anterior.ocupacion),
    adr: cambio(actual.adr, anterior.adr),
    revpar: cambio(actual.revpar, anterior.revpar),
    ingresoTotal: cambio(actual.ingresoTotal, anterior.ingresoTotal),
  };
}

// Pickup: de las reservas creadas en el período, cuántas son, cuántas ya se
// cancelaron, y las noches y el ingreso de alojamiento de las que siguen vigentes.
export function resumenPickup(reservas: ReservaDelRango[]) {
  const vigentes = reservas.filter((r) => VENDIDAS.includes(r.estado));
  return {
    reservas: reservas.length,
    canceladas: reservas.length - vigentes.length,
    noches: vigentes.reduce((s, r) => s + contarNoches(r.fechaEntrada, r.fechaSalida), 0),
    ingreso: pesos(
      vigentes.reduce((s, r) => s + [...ingresoPorNoche(r).values()].reduce((a, b) => a + b, 0), 0),
    ),
  };
}
