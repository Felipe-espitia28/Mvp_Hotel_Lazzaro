import { randomBytes, randomInt, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

// Hash de contraseñas con scrypt (incluido en Node, sin dependencias nativas).
// Formato guardado: "scrypt$<sal en hex>$<hash en hex>".
const scryptAsync = promisify(scrypt) as (
  contrasena: string,
  sal: Buffer,
  largo: number,
) => Promise<Buffer>;

const LARGO_HASH = 64;

export async function cifrarContrasena(contrasena: string) {
  const sal = randomBytes(16);
  const hash = await scryptAsync(contrasena, sal, LARGO_HASH);
  return `scrypt$${sal.toString('hex')}$${hash.toString('hex')}`;
}

export async function verificarContrasena(contrasena: string, guardado: string) {
  const [algoritmo, salHex, hashHex] = guardado.split('$');
  if (algoritmo !== 'scrypt' || !salHex || !hashHex) return false;

  const esperado = Buffer.from(hashHex, 'hex');
  const calculado = await scryptAsync(contrasena, Buffer.from(salHex, 'hex'), esperado.length);
  // Comparación en tiempo constante: no revela cuántos caracteres coinciden.
  return timingSafeEqual(calculado, esperado);
}

// Plan 18: la contraseña temporal que se envía por correo. Sin caracteres que
// se confunden al leerla (0/O, 1/l/I).
const ALFABETO_TEMPORAL = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
export const LARGO_TEMPORAL = 12;

export function generarContrasenaTemporal() {
  let temporal = '';
  for (let i = 0; i < LARGO_TEMPORAL; i++) {
    temporal += ALFABETO_TEMPORAL[randomInt(ALFABETO_TEMPORAL.length)];
  }
  return temporal;
}

// R72: la política de contraseñas. Devuelve el problema (para un 400) o null.
export const LARGO_MINIMO_CONTRASENA = 10;

export function problemaConContrasena(
  nueva: string,
  contexto: { email: string; temporal?: string | null },
) {
  if (nueva.length < LARGO_MINIMO_CONTRASENA) {
    return `La contraseña debe tener al menos ${LARGO_MINIMO_CONTRASENA} caracteres`;
  }
  if (!/[a-zA-ZñÑáéíóúÁÉÍÓÚ]/.test(nueva) || !/\d/.test(nueva)) {
    return 'La contraseña debe tener letras y números';
  }
  if (contexto.temporal && nueva === contexto.temporal) {
    return 'La contraseña nueva no puede ser la temporal';
  }
  const local = contexto.email.split('@')[0].toLowerCase();
  if (local.length >= 3 && nueva.toLowerCase().includes(local)) {
    return 'La contraseña no puede contener tu correo';
  }
  return null;
}
