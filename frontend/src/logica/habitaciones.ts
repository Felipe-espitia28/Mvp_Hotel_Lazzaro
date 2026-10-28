import type { Habitacion } from '../api/types';

// A-4: los números de un rango, como los arma el backend (habitaciones/piso.ts):
// con el prefijo y conservando los ceros de "desde". Vacío si el rango no es válido.
export function numerosDelRango(desde: string, hasta: string, prefijo = '') {
  if (!/^\d{1,6}$/.test(desde) || !/^\d{1,6}$/.test(hasta)) return [];
  const numeros: string[] = [];
  for (let n = Number(desde); n <= Number(hasta) && numeros.length <= 500; n++) {
    numeros.push(prefijo + String(n).padStart(desde.length, '0'));
  }
  return numeros;
}

// Los pisos que tienen habitaciones, de menor a mayor (para "seleccionar las del piso N").
export function pisosPresentes(habitaciones: Pick<Habitacion, 'piso'>[]) {
  return [...new Set(habitaciones.flatMap((h) => (h.piso === null ? [] : [h.piso])))].sort(
    (a, b) => a - b,
  );
}
