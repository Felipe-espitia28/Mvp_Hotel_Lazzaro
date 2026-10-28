// S-2: ayudantes de la agenda del día (sin React, para probarlos). Las horas
// son las del hotel (Colombia, UTC-5, sin horario de verano).
import type { EstadoCita } from '../api/types';

export const MINUTOS_POR_FRANJA = 15;
const DESFASE_MINUTOS = -5 * 60;

export const ETIQUETA_ESTADO_CITA: Record<EstadoCita, string> = {
  agendada: 'Agendada',
  en_curso: 'En curso',
  realizada: 'Realizada',
  cancelada: 'Cancelada',
  no_asistio: 'No asistió',
};

// Los mismos cambios que acepta el backend: agendada → en curso → realizada,
// o cancelada / no asistió. Recepción puede marcarla realizada directo.
const TRANSICIONES: Record<EstadoCita, Exclude<EstadoCita, 'agendada'>[]> = {
  agendada: ['en_curso', 'realizada', 'cancelada', 'no_asistio'],
  en_curso: ['realizada', 'cancelada'],
  realizada: [],
  cancelada: [],
  no_asistio: [],
};

export const transicionesDe = (estado: EstadoCita) => TRANSICIONES[estado];

// Las que ocupan su recurso (como la restricción de la base de datos).
export const ocupaRecurso = (estado: EstadoCita) => estado === 'agendada' || estado === 'en_curso';

// Minuto del día (0–1439) del hotel en un instante ISO.
export function minutoDelHotel(instante: string) {
  const local = new Date(new Date(instante).getTime() + DESFASE_MINUTOS * 60000);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
}

// "09:30" de un minuto del día.
export const textoHora = (minuto: number) =>
  `${String(Math.floor(minuto / 60)).padStart(2, '0')}:${String(minuto % 60).padStart(2, '0')}`;

// Instante ISO con la zona del hotel, p. ej. "2030-03-11T09:30:00-05:00".
export const instanteDelHotel = (fecha: string, minuto: number) =>
  `${fecha}T${textoHora(minuto)}:00-05:00`;

// Las franjas de la grilla, en minutos del día, de [desde, hasta).
export function franjasDelDia(desde = 7 * 60, hasta = 21 * 60) {
  return Array.from(
    { length: Math.ceil((hasta - desde) / MINUTOS_POR_FRANJA) },
    (_, i) => desde + i * MINUTOS_POR_FRANJA,
  );
}

// Fila de la grilla donde empieza la cita y cuántas franjas ocupa (sin el
// margen de limpieza). La fila 1 es el encabezado de los recursos.
export function ubicarCita(cita: { inicio: string; fin: string }, inicioGrilla: number) {
  const inicio = minutoDelHotel(cita.inicio);
  const duracion = (new Date(cita.fin).getTime() - new Date(cita.inicio).getTime()) / 60000;
  return {
    fila: Math.floor((inicio - inicioGrilla) / MINUTOS_POR_FRANJA) + 2,
    franjas: Math.max(1, Math.ceil(duracion / MINUTOS_POR_FRANJA)),
  };
}

// ¿La franja de un recurso está tapada por una cita vigente (con su margen)?
export function franjaOcupada(
  minuto: number,
  citas: { inicio: string; finOcupado: string; estado: EstadoCita }[],
) {
  return citas.some((c) => {
    if (!ocupaRecurso(c.estado)) return false;
    const inicio = minutoDelHotel(c.inicio);
    const fin = inicio + (new Date(c.finOcupado).getTime() - new Date(c.inicio).getTime()) / 60000;
    return minuto >= inicio && minuto < fin;
  });
}
