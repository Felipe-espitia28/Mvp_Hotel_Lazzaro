// Cálculos del calendario de ocupación (sin React, para poder probarlos).
// Las fechas son días de calendario en formato YYYY-MM-DD.

const MS_DIA = 24 * 60 * 60 * 1000;

export const sumarDias = (iso: string, dias: number) =>
  new Date(Date.parse(iso) + dias * MS_DIA).toISOString().slice(0, 10);

export const diasEntre = (desde: string, hasta: string) =>
  Math.round((Date.parse(hasta) - Date.parse(desde)) / MS_DIA);

// Columnas de la grilla que ocupa una reserva dentro del rango visible: una por
// noche (de la entrada a la víspera de la salida), recortada a los bordes. La
// columna 1 es la de las habitaciones, por eso el +2.
export function ubicar(
  reserva: { fechaEntrada: string; fechaSalida: string },
  desde: string,
  dias: number,
) {
  const inicio = Math.max(0, diasEntre(desde, reserva.fechaEntrada));
  const fin = Math.min(dias, diasEntre(desde, reserva.fechaSalida));
  return {
    columna: `${inicio + 2} / ${fin + 2}`,
    sigueAntes: diasEntre(desde, reserva.fechaEntrada) < 0,
    sigueDespues: diasEntre(desde, reserva.fechaSalida) > dias,
  };
}

// A-5: el día de la grilla bajo el puntero al agarrar una barra: la barra
// empieza en `primerDia` y cubre `noches` columnas de igual ancho.
export function diaBajoElPuntero(primerDia: string, noches: number, x: number, ancho: number) {
  const columna = Math.min(noches - 1, Math.max(0, Math.floor((x / ancho) * noches)));
  return sumarDias(primerDia, columna);
}

// A-5: a dónde lleva soltar una barra arrastrada. En horizontal se mueven las
// fechas (los días entre donde se agarró y donde se soltó); en vertical, la
// habitación. Una estadía en curso no cambia su entrada: solo corre la salida
// (y nunca a antes de la entrada). Solo abre el modal: nada se guarda aquí.
export function destinoDelArrastre(
  reserva: { fechaEntrada: string; fechaSalida: string; habitacionId: string; estado: string },
  diaAgarrado: string,
  diaSoltado: string,
  habitacionDestino: string,
) {
  const corrimiento = diasEntre(diaAgarrado, diaSoltado);
  const entrada = reserva.fechaEntrada.slice(0, 10);
  const salida = reserva.fechaSalida.slice(0, 10);
  const enCurso = reserva.estado === 'activa';
  const fechaSalida = sumarDias(salida, corrimiento);
  const destino = {
    fechaEntrada: enCurso ? entrada : sumarDias(entrada, corrimiento),
    fechaSalida: enCurso && fechaSalida <= entrada ? sumarDias(entrada, 1) : fechaSalida,
    habitacionId: habitacionDestino,
  };
  return {
    ...destino,
    cambia:
      destino.fechaEntrada !== entrada ||
      destino.fechaSalida !== salida ||
      habitacionDestino !== reserva.habitacionId,
  };
}
