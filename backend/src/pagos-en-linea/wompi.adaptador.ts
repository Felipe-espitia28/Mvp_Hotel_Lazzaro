import { firmaDeIntegridad, leerEventoWompi, transaccionDeWompi } from './firma-wompi';
import { Ambiente, LlavesWompi } from './llaves';
import { IPasarelaDePagos, SolicitudDeLink, Transaccion } from './puerto';

// B-2: adaptador real de Wompi, según su documentación pública. Si algo
// difiere al probar con las llaves de sandbox, se corrige solo aquí, en
// firma-wompi.ts y en las respuestas de ejemplo (test/fixtures/wompi).

export const URL_API_WOMPI: Record<Ambiente, string> = {
  pruebas: 'https://sandbox.wompi.co/v1',
  produccion: 'https://production.wompi.co/v1',
};
export const URL_CHECKOUT_WOMPI = 'https://checkout.wompi.co/p/';
const MONEDA = 'COP';

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export class PasarelaWompi implements IPasarelaDePagos {
  readonly proveedor = 'wompi' as const;

  constructor(
    private readonly llaves: LlavesWompi,
    private readonly ambiente: Ambiente,
    // Inyectable: las pruebas usan un fetch falso, sin red.
    private readonly pedir: Fetch = fetch,
  ) {}

  // Web Checkout: una URL con nuestra referencia y el monto, firmados con el
  // secreto de integridad (así nadie cambia el monto en el navegador).
  crearLinkDePago(solicitud: SolicitudDeLink) {
    const montoEnCentavos = Math.round(solicitud.monto * 100);
    const expiraEn = solicitud.expiraEn.toISOString();
    const parametros = new URLSearchParams({
      'public-key': this.llaves.llavePublica,
      currency: MONEDA,
      'amount-in-cents': String(montoEnCentavos),
      reference: solicitud.referencia,
      'signature:integrity': firmaDeIntegridad({
        referencia: solicitud.referencia,
        montoEnCentavos,
        moneda: MONEDA,
        expiraEn,
        secretoIntegridad: this.llaves.secretoIntegridad,
      }),
      'redirect-url': solicitud.urlRetorno,
      'expiration-time': expiraEn,
    });
    return Promise.resolve(`${URL_CHECKOUT_WOMPI}?${parametros.toString()}`);
  }

  verificarEvento(cuerpo: unknown) {
    return leerEventoWompi(cuerpo, this.llaves.secretoEventos);
  }

  // Transacciones de nuestra referencia (con la llave privada, desde el
  // servidor). Si hubo varios intentos, cuenta el aprobado; si no, el último.
  async consultarTransaccion(referencia: string): Promise<Transaccion | null> {
    const respuesta = await this.pedir(
      `${URL_API_WOMPI[this.ambiente]}/transactions?reference=${encodeURIComponent(referencia)}`,
      { headers: { Authorization: `Bearer ${this.llaves.llavePrivada}` } },
    );
    if (!respuesta.ok) {
      throw new Error(`Wompi respondió ${respuesta.status} al consultar ${referencia}`);
    }
    const { data } = (await respuesta.json()) as { data?: Record<string, unknown>[] };
    const transacciones = (data ?? []).map(transaccionDeWompi);
    if (transacciones.length === 0) return null;
    return transacciones.find((t) => t.estado === 'aprobada') ?? transacciones.at(-1)!;
  }

  // El comercio de la llave pública (endpoint público de Wompi).
  async probarConexion() {
    try {
      const respuesta = await this.pedir(
        `${URL_API_WOMPI[this.ambiente]}/merchants/${this.llaves.llavePublica}`,
      );
      if (!respuesta.ok) {
        return { ok: false, mensaje: `Wompi no reconoce la llave pública (${respuesta.status})` };
      }
      const { data } = (await respuesta.json()) as { data?: { name?: string } };
      return { ok: true, mensaje: `Conectado con el comercio ${data?.name ?? 'de Wompi'}` };
    } catch {
      return { ok: false, mensaje: 'No se pudo contactar a Wompi' };
    }
  }
}
