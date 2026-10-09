import { randomBytes, scrypt, timingSafeEqual } from 'crypto';
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
