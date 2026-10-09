// Políticas del hotel (docs/REGLAS_DE_NEGOCIO.md). En el MVP son constantes;
// más adelante cada hotel las configurará.
export const POLITICAS = {
  // Colombia está en UTC-5 todo el año (no tiene horario de verano), así que
  // un desfase fijo basta para saber "qué día es hoy" en el hotel.
  desfaseUtcHoras: -5,
  horaCheckIn: 15, // R18
  horaCheckOut: 12, // R18
  estadiaMaximaNoches: 30, // R4
  antelacionMaximaDias: 365, // R4
  horasCancelacionGratuita: 48, // R9
  nochesPenalidad: 1, // R9 y R10
} as const;

const MS_HORA = 60 * 60 * 1000;
const MS_DIA = 24 * MS_HORA;

// Las fechas de reserva son días de calendario (columna DATE): se representan
// como Date a medianoche UTC, igual que las devuelve Prisma.

// Día de calendario del hotel en un instante dado.
export function fechaDelHotel(instante: Date): Date {
  const local = new Date(instante.getTime() + POLITICAS.desfaseUtcHoras * MS_HORA);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

// Instante real de una hora local del hotel en un día dado (p. ej. el 10 a las 15:00).
export function instanteDelHotel(fecha: Date, hora: number): Date {
  return new Date(fecha.getTime() + (hora - POLITICAS.desfaseUtcHoras) * MS_HORA);
}

export function sumarDias(fecha: Date, dias: number): Date {
  return new Date(fecha.getTime() + dias * MS_DIA);
}

export function contarNoches(entrada: Date, salida: Date): number {
  return Math.round((salida.getTime() - entrada.getTime()) / MS_DIA);
}

// R9: cancelar es gratis hasta 48 h antes de la hora de check-in del día de entrada.
export function limiteCancelacionGratuita(fechaEntrada: Date): Date {
  const checkIn = instanteDelHotel(fechaEntrada, POLITICAS.horaCheckIn);
  return new Date(checkIn.getTime() - POLITICAS.horasCancelacionGratuita * MS_HORA);
}

// R10: si a la hora de check-out del día siguiente a la entrada el huésped no
// ha llegado, la reserva es un no-show.
export function limiteNoShow(fechaEntrada: Date): Date {
  return instanteDelHotel(sumarDias(fechaEntrada, 1), POLITICAS.horaCheckOut);
}
