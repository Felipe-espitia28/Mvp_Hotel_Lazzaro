import { randomUUID } from 'node:crypto';
import { EventoWompi, firmarEvento, leerEventoWompi } from './firma-wompi';
import { IPasarelaDePagos, SolicitudDeLink, Transaccion } from './puerto';

// B-2: pasarela simulada para la demo y las pruebas, sin internet ni llaves.
// Su link lleva a una página propia (/pago-simulado) con "Aprobar" y
// "Rechazar"; el botón produce un evento firmado igual que Wompi, que pasa por
// el mismo webhook y la misma verificación. Prohibida en producción.

// Secreto de desarrollo: no protege dinero real.
export const SECRETO_SIMULADO_POR_DEFECTO = 'test_events_pasarela_simulada';
export const secretoSimulado = () =>
  process.env.PASARELA_SIMULADA_SECRETO || SECRETO_SIMULADO_POR_DEFECTO;

// Lo que se pulsó en la página, para que la consulta de la reconciliación
// responda igual que Wompi. Vive en memoria: es solo un simulador.
const decisiones = new Map<string, Transaccion>();

export class PasarelaSimulada implements IPasarelaDePagos {
  readonly proveedor = 'simulada' as const;

  constructor(private readonly urlApp: string) {}

  crearLinkDePago(solicitud: SolicitudDeLink) {
    return Promise.resolve(
      `${this.urlApp}/pago-simulado?referencia=${encodeURIComponent(solicitud.referencia)}`,
    );
  }

  verificarEvento(cuerpo: unknown) {
    return leerEventoWompi(cuerpo, secretoSimulado());
  }

  consultarTransaccion(referencia: string) {
    return Promise.resolve(decisiones.get(referencia) ?? null);
  }

  probarConexion() {
    return Promise.resolve({ ok: true, mensaje: 'Pasarela simulada: no necesita conexión' });
  }

  // El botón de la página: anota el resultado (el primero manda, como en una
  // transacción real) y arma el evento transaction.updated firmado.
  static decidir(referencia: string, montoEnCentavos: number, aprobar: boolean, ahora: Date) {
    const transaccion = decisiones.get(referencia) ?? {
      id: `sim-${randomUUID()}`,
      referencia,
      montoEnCentavos,
      moneda: 'COP',
      estado: aprobar ? 'aprobada' : 'rechazada',
    };
    decisiones.set(referencia, transaccion);
    return eventoSimulado(transaccion, ahora);
  }
}

// Un evento con la forma de Wompi para una transacción (lo usan también las pruebas).
export function eventoSimulado(t: Transaccion, ahora: Date, secreto = secretoSimulado()) {
  const estado = { aprobada: 'APPROVED', rechazada: 'DECLINED', pendiente: 'PENDING' }[t.estado];
  const evento: Omit<EventoWompi, 'signature'> = {
    event: 'transaction.updated',
    data: {
      transaction: {
        id: t.id,
        amount_in_cents: t.montoEnCentavos,
        reference: t.referencia,
        currency: t.moneda,
        payment_method_type: 'CARD',
        status: estado,
      },
    },
    environment: 'test',
    timestamp: Math.floor(ahora.getTime() / 1000),
    sent_at: ahora.toISOString(),
  };
  return firmarEvento(
    evento,
    ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'],
    secreto,
  );
}
