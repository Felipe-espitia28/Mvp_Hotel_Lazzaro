import { createHash, timingSafeEqual } from 'node:crypto';
import { EstadoTransaccion, ResultadoDeEvento, Transaccion } from './puerto';

// B-2: firmas de Wompi, tal como las publica su documentación
// (docs.wompi.co: "Eventos" y "Widget & Checkout Web"). Las usan el adaptador
// de Wompi, el simulado (que firma igual) y las pruebas: lo que se prueba hoy
// con el simulado es lo mismo que verificará Wompi.

export interface EventoWompi {
  event: string;
  data: Record<string, unknown>;
  environment?: string;
  signature: { properties: string[]; checksum: string };
  timestamp: number;
  sent_at?: string;
}

const sha256 = (texto: string) => createHash('sha256').update(texto).digest('hex');

// "transaction.amount_in_cents" → data.transaction.amount_in_cents.
function valorEn(data: unknown, ruta: string): unknown {
  return ruta
    .split('.')
    .reduce<unknown>(
      (objeto, clave) =>
        objeto && typeof objeto === 'object'
          ? (objeto as Record<string, unknown>)[clave]
          : undefined,
      data,
    );
}

// Lo que se firma: los valores de signature.properties (en su orden) +
// timestamp + secreto de eventos. Las propiedades se leen del evento: Wompi
// avisa que pueden cambiar con el tiempo.
export function cadenaDeEvento(
  data: unknown,
  propiedades: string[],
  timestamp: number,
  secretoEventos: string,
) {
  const valores = propiedades.map((p) => String(valorEn(data, p) ?? '')).join('');
  return `${valores}${timestamp}${secretoEventos}`;
}

export const checksumDeEvento = (...datos: Parameters<typeof cadenaDeEvento>) =>
  sha256(cadenaDeEvento(...datos));

export function firmarEvento(
  evento: Omit<EventoWompi, 'signature'>,
  propiedades: string[],
  secretoEventos: string,
): EventoWompi {
  return {
    ...evento,
    signature: {
      properties: propiedades,
      checksum: checksumDeEvento(evento.data, propiedades, evento.timestamp, secretoEventos),
    },
  };
}

function esEvento(cuerpo: unknown): cuerpo is EventoWompi {
  const e = cuerpo as EventoWompi | null;
  return (
    !!e &&
    typeof e === 'object' &&
    typeof e.event === 'string' &&
    !!e.data &&
    typeof e.data === 'object' &&
    Array.isArray(e.signature?.properties) &&
    e.signature.properties.every((p) => typeof p === 'string') &&
    typeof e.signature.checksum === 'string' &&
    (typeof e.timestamp === 'number' || typeof e.timestamp === 'string')
  );
}

export function verificarFirma(cuerpo: unknown, secretoEventos: string): boolean {
  if (!esEvento(cuerpo)) return false;
  const esperado = Buffer.from(
    checksumDeEvento(
      cuerpo.data,
      cuerpo.signature.properties,
      Number(cuerpo.timestamp),
      secretoEventos,
    ),
  );
  // La documentación muestra el checksum en mayúsculas; el hex es el mismo.
  const recibido = Buffer.from(cuerpo.signature.checksum.toLowerCase());
  return recibido.length === esperado.length && timingSafeEqual(recibido, esperado);
}

// Firma de integridad del Web Checkout: SHA256 de referencia + monto en
// centavos + moneda [+ fecha de expiración] + secreto de integridad.
export function firmaDeIntegridad(datos: {
  referencia: string;
  montoEnCentavos: number;
  moneda: string;
  expiraEn?: string;
  secretoIntegridad: string;
}) {
  return sha256(
    `${datos.referencia}${datos.montoEnCentavos}${datos.moneda}${datos.expiraEn ?? ''}${datos.secretoIntegridad}`,
  );
}

// Estados de una transacción de Wompi. VOIDED (anulada, solo tarjetas) y
// ERROR también dejan el intento sin pago.
const ESTADOS: Record<string, EstadoTransaccion> = {
  PENDING: 'pendiente',
  APPROVED: 'aprobada',
  DECLINED: 'rechazada',
  VOIDED: 'rechazada',
  ERROR: 'rechazada',
};

export function transaccionDeWompi(t: Record<string, unknown>): Transaccion {
  return {
    id: String(t.id),
    referencia: String(t.reference),
    montoEnCentavos: Number(t.amount_in_cents),
    moneda: String(t.currency ?? 'COP'),
    estado: ESTADOS[String(t.status)] ?? 'pendiente',
  };
}

// Lee un evento con el formato de Wompi: primero la firma; luego, si es la
// actualización de una transacción, la transacción.
export function leerEventoWompi(cuerpo: unknown, secretoEventos: string): ResultadoDeEvento {
  if (!verificarFirma(cuerpo, secretoEventos)) return { firmaValida: false, transaccion: null };
  const evento = cuerpo as EventoWompi;
  const transaccion = evento.data.transaction;
  if (evento.event !== 'transaction.updated' || !transaccion || typeof transaccion !== 'object') {
    return { firmaValida: true, transaccion: null };
  }
  return {
    firmaValida: true,
    transaccion: transaccionDeWompi(transaccion as Record<string, unknown>),
  };
}
