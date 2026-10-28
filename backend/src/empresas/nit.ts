// B-5: el NIT de una empresa, como lo usa la DIAN: el número sin puntos ni
// guion y el dígito de verificación aparte. Así "900.123.456-8" y
// "9001234568" son la misma empresa (el índice único lo hace cumplir).

// Pesos de la DIAN, del dígito de la derecha hacia la izquierda.
const PESOS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

export function digitoVerificacion(numero: string) {
  const suma = [...numero]
    .reverse()
    .reduce((total, digito, i) => total + Number(digito) * PESOS[i], 0);
  const residuo = suma % 11;
  return String(residuo >= 2 ? 11 - residuo : residuo);
}

export class NitInvalidoError extends Error {}

// Acepta "900.123.456-8", "900123456-8", "9001234568" (10 dígitos: el último
// es el dígito de verificación) o "900123456" (se calcula). Un dígito de
// verificación que no cuadra es un NIT mal escrito.
export function normalizarNit(texto: string) {
  const limpio = texto.replace(/[\s.]/g, '');
  const partes = /^(\d{5,15})(?:-(\d))?$/.exec(limpio);
  if (!partes) {
    throw new NitInvalidoError('El NIT debe tener solo números, p. ej. 900.123.456-8');
  }
  let [, numero, digito] = partes;
  if (!digito && numero.length === 10) {
    digito = numero.slice(-1);
    numero = numero.slice(0, -1);
  }
  const calculado = digitoVerificacion(numero);
  if (digito !== undefined && digito !== calculado) {
    throw new NitInvalidoError(
      `El dígito de verificación de ${numero} es ${calculado}, no ${digito}: revisa el NIT`,
    );
  }
  return { nit: numero, digitoVerificacion: calculado };
}
