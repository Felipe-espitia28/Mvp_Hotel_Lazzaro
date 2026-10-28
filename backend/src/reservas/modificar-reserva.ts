import { Desglose, recortarDesglose } from '../tarifas/motor-tarificacion';

// A-5: ayudantes puros para modificar una reserva (sin NestJS ni Prisma).

const MS_DIA = 24 * 60 * 60 * 1000;
const iso = (fecha: Date) => fecha.toISOString().slice(0, 10);

// Las noches de una estadía como YYYY-MM-DD (de la entrada a la víspera de la salida).
export function fechasDeNoches(entrada: Date, salida: Date) {
  const fechas: string[] = [];
  for (let t = entrada.getTime(); t < salida.getTime(); t += MS_DIA) {
    fechas.push(iso(new Date(t)));
  }
  return fechas;
}

// Noches pactadas que la modificación quita (en el orden de la estadía).
export function nochesEliminadas(
  pactada: { fechaEntrada: Date; fechaSalida: Date },
  nueva: { fechaEntrada: Date; fechaSalida: Date },
) {
  const quedan = new Set(fechasDeNoches(nueva.fechaEntrada, nueva.fechaSalida));
  return fechasDeNoches(pactada.fechaEntrada, pactada.fechaSalida).filter((f) => !quedan.has(f));
}

// R7 (A-5): acortar fuera del plazo de cancelación gratuita cobra las noches de
// penalidad pactadas sobre las noches eliminadas: el valor (con adicionales,
// niños e IVA del desglose congelado) de las primeras de ellas. Las reservas
// sin desglose usan el promedio por noche, como la cancelación.
export function penalidadPorAcortar(
  reserva: { desglose: Desglose | null; valorAlojamiento: number; noches: number },
  eliminadas: string[],
  nochesPenalidad: number,
) {
  const cobradas = Math.min(nochesPenalidad, eliminadas.length);
  if (cobradas === 0) return 0;
  if (!reserva.desglose) {
    return Math.round((reserva.valorAlojamiento / reserva.noches) * cobradas);
  }
  const quitadas = new Set(eliminadas);
  const soloEliminadas = {
    ...reserva.desglose,
    noches: reserva.desglose.noches.filter((n) => quitadas.has(n.fecha)),
  };
  return recortarDesglose(soloEliminadas, cobradas).total;
}

// Lo que se ve de una reserva en la auditoría de una modificación.
export interface ResumenReserva {
  fechaEntrada: string;
  fechaSalida: string;
  habitacion: string;
  adultos: number;
  edadesNinos: number[];
  total: number;
}

const dinero = (valor: number) => `$${valor.toLocaleString('es-CO')}`;
const personas = (r: ResumenReserva) =>
  `${r.adultos} ${r.adultos === 1 ? 'adulto' : 'adultos'}` +
  (r.edadesNinos.length > 0
    ? ` y ${r.edadesNinos.length} ${r.edadesNinos.length === 1 ? 'niño' : 'niños'} (${r.edadesNinos.join(', ')})`
    : '');

// "Fechas 2030-03-10 a 2030-03-12 → 2030-03-10 a 2030-03-14 · Total $260.000 →
// $380.000": solo lo que cambió (el total siempre).
export function detalleModificacion(antes: ResumenReserva, despues: ResumenReserva) {
  const fechas = (r: ResumenReserva) => `${r.fechaEntrada} a ${r.fechaSalida}`;
  const partes: string[] = [];
  if (fechas(antes) !== fechas(despues)) {
    partes.push(`Fechas ${fechas(antes)} → ${fechas(despues)}`);
  }
  if (antes.habitacion !== despues.habitacion) {
    partes.push(`Habitación ${antes.habitacion} → ${despues.habitacion}`);
  }
  if (personas(antes) !== personas(despues)) {
    partes.push(`${personas(antes)} → ${personas(despues)}`);
  }
  partes.push(`Total ${dinero(antes.total)} → ${dinero(despues.total)}`);
  return partes.join(' · ');
}
