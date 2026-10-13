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
