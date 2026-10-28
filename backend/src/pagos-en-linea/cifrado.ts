import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// B-2: las llaves de Wompi de cada hotel se guardan cifradas con AES-256-GCM
// (cifra y autentica: una fila alterada no se descifra). La llave maestra
// sale del entorno (CLAVE_CIFRADO_PAGOS, 32 bytes en base64), nunca del código.

const ALGORITMO = 'aes-256-gcm';
const VERSION = 'v1';

export function llaveMaestra(): Buffer | null {
  const texto = process.env.CLAVE_CIFRADO_PAGOS;
  if (!texto) return null;
  const llave = Buffer.from(texto, 'base64');
  return llave.length === 32 ? llave : null;
}

function exigirLlave(llave: Buffer | null): Buffer {
  if (!llave) {
    throw new Error('CLAVE_CIFRADO_PAGOS falta o no tiene 32 bytes en base64');
  }
  return llave;
}

// "v1:iv:etiqueta:datos" (las tres partes en base64).
export function cifrar(texto: string, llave = llaveMaestra()) {
  const iv = randomBytes(12);
  const cifrador = createCipheriv(ALGORITMO, exigirLlave(llave), iv);
  const datos = Buffer.concat([cifrador.update(texto, 'utf8'), cifrador.final()]);
  const partes = [iv, cifrador.getAuthTag(), datos].map((p) => p.toString('base64'));
  return [VERSION, ...partes].join(':');
}

export function descifrar(guardado: string, llave = llaveMaestra()) {
  const [version, iv, etiqueta, datos] = guardado.split(':');
  if (version !== VERSION || !iv || !etiqueta || !datos) {
    throw new Error('Formato de llave cifrada desconocido');
  }
  const descifrador = createDecipheriv(ALGORITMO, exigirLlave(llave), Buffer.from(iv, 'base64'));
  descifrador.setAuthTag(Buffer.from(etiqueta, 'base64'));
  return Buffer.concat([
    descifrador.update(Buffer.from(datos, 'base64')),
    descifrador.final(),
  ]).toString('utf8');
}
