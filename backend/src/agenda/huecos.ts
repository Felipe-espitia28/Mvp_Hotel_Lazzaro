// S-2: horarios y huecos libres de la agenda. Función pura (sin NestJS ni
// Prisma), para probarla sin base de datos. Las horas del horario de un
// servicio son del hotel (Colombia, UTC-5); los instantes son Date en UTC.

export interface Disponibilidad {
  dias: number[]; // 1 = lunes … 7 = domingo
  desde: string; // "08:00"
  hasta: string; // "18:00"
}

export interface Ocupado {
  inicio: Date;
  finOcupado: Date; // fin del servicio + margen de limpieza
}

const DESFASE_UTC_HORAS = -5;
const MS_MINUTO = 60 * 1000;
export const MINUTOS_POR_FRANJA = 15;

const minutosDe = (hora: string) => {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
};

// Día (YYYY-MM-DD) y minuto del día en la hora del hotel.
export function horaDelHotel(instante: Date) {
  const local = new Date(instante.getTime() + DESFASE_UTC_HORAS * 60 * MS_MINUTO);
  return {
    fecha: local.toISOString().slice(0, 10),
    minuto: local.getUTCHours() * 60 + local.getUTCMinutes(),
    // 1 = lunes … 7 = domingo
    diaSemana: local.getUTCDay() === 0 ? 7 : local.getUTCDay(),
  };
}

// Instante de un minuto del día del hotel (p. ej. el 10 de marzo a las 09:30).
export function instanteDelDia(fecha: string, minuto: number) {
  return new Date(
    new Date(`${fecha}T00:00:00.000Z`).getTime() + (minuto - DESFASE_UTC_HORAS * 60) * MS_MINUTO,
  );
}

export const sumarMinutos = (instante: Date, minutos: number) =>
  new Date(instante.getTime() + minutos * MS_MINUTO);

// La cita [inicio, fin) cabe en el horario del servicio: un día permitido,
// desde la hora de apertura y terminando a más tardar al cierre, el mismo
// día. Sin horario, el servicio se presta a cualquier hora.
export function dentroDelHorario(disponibilidad: Disponibilidad | null, inicio: Date, fin: Date) {
  if (!disponibilidad) return true;
  const a = horaDelHotel(inicio);
  const b = horaDelHotel(fin);
  const terminaElMismoDia = b.fecha === a.fecha || (b.minuto === 0 && fin > inicio);
  const minutoFin = b.fecha === a.fecha ? b.minuto : 24 * 60;
  return (
    disponibilidad.dias.includes(a.diaSemana) &&
    terminaElMismoDia &&
    a.minuto >= minutosDe(disponibilidad.desde) &&
    minutoFin <= minutosDe(disponibilidad.hasta)
  );
}

// Dos rangos [a, b) y [c, d) se cruzan si a < d y c < b.
const seCruzan = (a: Date, b: Date, c: Date, d: Date) => a < d && c < b;

// Las franjas de 15 minutos de `fecha` donde cabe una cita de `duracion`
// minutos: dentro del horario y sin cruzar lo ocupado del recurso (cada cita
// ocupa su duración más el margen, igual que en la restricción cita_sin_cruce).
export function huecosLibres({
  fecha,
  disponibilidad,
  duracionMinutos,
  margenMinutos,
  ocupados,
  noAntesDe,
}: {
  fecha: string;
  disponibilidad: Disponibilidad | null;
  duracionMinutos: number;
  margenMinutos: number;
  ocupados: Ocupado[];
  noAntesDe?: Date; // no ofrecer huecos que ya pasaron
}) {
  const apertura = disponibilidad ? minutosDe(disponibilidad.desde) : 0;
  const cierre = disponibilidad ? minutosDe(disponibilidad.hasta) : 24 * 60;
  const huecos: { inicio: Date; fin: Date }[] = [];
  for (let m = apertura; m + duracionMinutos <= cierre; m += MINUTOS_POR_FRANJA) {
    const inicio = instanteDelDia(fecha, m);
    const fin = sumarMinutos(inicio, duracionMinutos);
    const finOcupado = sumarMinutos(fin, margenMinutos);
    if (noAntesDe && inicio < noAntesDe) continue;
    if (!dentroDelHorario(disponibilidad, inicio, fin)) continue;
    if (ocupados.some((o) => seCruzan(inicio, finOcupado, o.inicio, o.finOcupado))) continue;
    huecos.push({ inicio, fin });
  }
  return huecos;
}
