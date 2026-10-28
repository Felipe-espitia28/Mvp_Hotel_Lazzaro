// A-4: el piso de una habitación se infiere de su número cuando no se da
// (101 → 1, 1203 → 12). Los números no numéricos ("A-1") o de menos de 3
// dígitos quedan sin piso. La migración piso_y_descripcion aplica la misma
// regla en SQL a las habitaciones existentes.
export function pisoDelNumero(numero: string): number | null {
  return /^\d{3,6}$/.test(numero) ? Math.floor(Number(numero) / 100) : null;
}

// Los números de un rango ("101" a "120"), con el prefijo y conservando los
// ceros a la izquierda de "desde" ("01" a "12" → "01", "02"... "12").
export function numerosDelRango(desde: string, hasta: string, prefijo = '') {
  const inicio = Number(desde);
  const fin = Number(hasta);
  const ancho = desde.length;
  const numeros: string[] = [];
  for (let n = inicio; n <= fin; n++) numeros.push(prefijo + String(n).padStart(ancho, '0'));
  return numeros;
}
