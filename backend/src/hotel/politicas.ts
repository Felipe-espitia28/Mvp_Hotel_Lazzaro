// Políticas del hotel (docs/REGLAS_DE_NEGOCIO.md). Cada hotel puede ajustar
// las suyas desde la Gerencia; lo que no ajuste toma estos valores por defecto.
import { MedioPago } from '@prisma/client';
import type { Temporada } from '../tarifas/temporadas';

export interface PoliticasHotel {
  horaCheckIn: number; // R18
  horaCheckOut: number; // R18
  estadiaMaximaNoches: number; // R4
  antelacionMaximaDias: number; // R4
  horasCancelacionGratuita: number; // R9
  nochesPenalidad: number; // R9 y R10
  // R13: la tarifa base (temporada baja) se multiplica según la temporada de cada noche.
  multiplicadorTemporada: Record<Temporada, number>;
  // R16 (⚖️ validar con contador): IVA sobre el alojamiento.
  ivaPorcentaje: number;
  // Exento el huésped extranjero no residente (en el MVP: quien se registra con pasaporte).
  exencionIvaPasaporte: boolean;
  // R23: medios con los que el hotel recibe el pago del check-out.
  mediosPago: MedioPago[];
  // R15: temporadas calculadas para Colombia que el hotel puede activar o no.
  puentesFestivosMedia: boolean;
  semanaSantaAlta: boolean;
  // A-3: rangos de edad (cumplida a la fecha de entrada). Hasta
  // edadMaximaNinoGratis no paga; hasta edadMaximaNino paga tarifa de niño;
  // desde edadMaximaNino + 1, como adulto.
  edadMaximaNinoGratis: number;
  edadMaximaNino: number;
}

export const POLITICAS_POR_DEFECTO: PoliticasHotel = {
  horaCheckIn: 15,
  horaCheckOut: 12,
  estadiaMaximaNoches: 30,
  antelacionMaximaDias: 365,
  horasCancelacionGratuita: 48,
  nochesPenalidad: 1,
  multiplicadorTemporada: { baja: 1, media: 1.15, alta: 1.3 },
  ivaPorcentaje: 19,
  exencionIvaPasaporte: true,
  mediosPago: ['efectivo', 'tarjeta', 'transferencia'],
  puentesFestivosMedia: true,
  semanaSantaAlta: true,
  edadMaximaNinoGratis: 4,
  edadMaximaNino: 11,
};

// Las políticas guardadas en el hotel (JSON) sobre los valores por defecto.
// Se ignora lo que no tenga el tipo esperado: un JSON viejo o incompleto
// nunca deja al hotel sin una regla.
export function resolverPoliticas(guardadas: unknown): PoliticasHotel {
  const g = (guardadas && typeof guardadas === 'object' ? guardadas : {}) as Record<
    string,
    unknown
  >;
  const base = POLITICAS_POR_DEFECTO;
  const numero = (clave: keyof PoliticasHotel) =>
    typeof g[clave] === 'number' ? (g[clave] as number) : (base[clave] as number);
  const booleano = (clave: keyof PoliticasHotel) =>
    typeof g[clave] === 'boolean' ? (g[clave] as boolean) : (base[clave] as boolean);
  const mult = (g.multiplicadorTemporada ?? {}) as Partial<Record<Temporada, unknown>>;
  const factor = (t: Temporada) =>
    typeof mult[t] === 'number' ? (mult[t] as number) : base.multiplicadorTemporada[t];
  const medios = Array.isArray(g.mediosPago)
    ? (g.mediosPago as unknown[]).filter((m): m is MedioPago =>
        base.mediosPago.includes(m as MedioPago),
      )
    : [];

  return {
    horaCheckIn: numero('horaCheckIn'),
    horaCheckOut: numero('horaCheckOut'),
    estadiaMaximaNoches: numero('estadiaMaximaNoches'),
    antelacionMaximaDias: numero('antelacionMaximaDias'),
    horasCancelacionGratuita: numero('horasCancelacionGratuita'),
    nochesPenalidad: numero('nochesPenalidad'),
    multiplicadorTemporada: { baja: factor('baja'), media: factor('media'), alta: factor('alta') },
    ivaPorcentaje: numero('ivaPorcentaje'),
    exencionIvaPasaporte: booleano('exencionIvaPasaporte'),
    mediosPago: medios.length > 0 ? medios : base.mediosPago,
    puentesFestivosMedia: booleano('puentesFestivosMedia'),
    semanaSantaAlta: booleano('semanaSantaAlta'),
    edadMaximaNinoGratis: numero('edadMaximaNinoGratis'),
    edadMaximaNino: numero('edadMaximaNino'),
  };
}

// Colombia está en UTC-5 todo el año (no tiene horario de verano), así que
// un desfase fijo basta para saber "qué día es hoy" en el hotel. Todos los
// hoteles de la plataforma están en Colombia.
const DESFASE_UTC_HORAS = -5;

const MS_HORA = 60 * 60 * 1000;
const MS_DIA = 24 * MS_HORA;

// Las fechas de reserva son días de calendario (columna DATE): se representan
// como Date a medianoche UTC, igual que las devuelve Prisma.

// Día de calendario del hotel en un instante dado.
export function fechaDelHotel(instante: Date): Date {
  const local = new Date(instante.getTime() + DESFASE_UTC_HORAS * MS_HORA);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

// Instante real de una hora local del hotel en un día dado (p. ej. el 10 a las 15:00).
export function instanteDelHotel(fecha: Date, hora: number): Date {
  return new Date(fecha.getTime() + (hora - DESFASE_UTC_HORAS) * MS_HORA);
}

export function sumarDias(fecha: Date, dias: number): Date {
  return new Date(fecha.getTime() + dias * MS_DIA);
}

export function contarNoches(entrada: Date, salida: Date): number {
  return Math.round((salida.getTime() - entrada.getTime()) / MS_DIA);
}

// R9: cancelar es gratis hasta N horas antes de la hora de check-in del día de entrada.
export function limiteCancelacionGratuita(
  fechaEntrada: Date,
  politicas: Pick<PoliticasHotel, 'horaCheckIn' | 'horasCancelacionGratuita'>,
): Date {
  const checkIn = instanteDelHotel(fechaEntrada, politicas.horaCheckIn);
  return new Date(checkIn.getTime() - politicas.horasCancelacionGratuita * MS_HORA);
}

// R10: si a la hora de check-out del día siguiente a la entrada el huésped no
// ha llegado, la reserva es un no-show.
export function limiteNoShow(
  fechaEntrada: Date,
  politicas: Pick<PoliticasHotel, 'horaCheckOut'>,
): Date {
  return instanteDelHotel(sumarDias(fechaEntrada, 1), politicas.horaCheckOut);
}
