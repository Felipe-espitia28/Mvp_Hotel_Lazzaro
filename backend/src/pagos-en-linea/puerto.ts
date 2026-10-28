// B-2: puerto de la pasarela de pagos. El dominio (folio y reservas) solo
// conoce estos tipos; los adaptadores (simulada y Wompi) traducen al formato
// de cada proveedor.

export type Proveedor = 'simulada' | 'wompi';

// pendiente: nadie ha pagado o el pago no ha terminado.
export type EstadoTransaccion = 'pendiente' | 'aprobada' | 'rechazada';

export interface Transaccion {
  // Id de la transacción en el proveedor (único: base de la idempotencia).
  id: string;
  referencia: string;
  montoEnCentavos: number;
  moneda: string;
  estado: EstadoTransaccion;
}

export interface SolicitudDeLink {
  referencia: string;
  // En pesos; el monto lo fija el servidor, nunca el cliente.
  monto: number;
  urlRetorno: string;
  expiraEn: Date;
}

export interface ResultadoDeEvento {
  firmaValida: boolean;
  // null si el evento es de otro tipo (no es de una transacción).
  transaccion: Transaccion | null;
}

export interface IPasarelaDePagos {
  readonly proveedor: Proveedor;
  // Devuelve la URL que se le envía al huésped.
  crearLinkDePago(solicitud: SolicitudDeLink): Promise<string>;
  verificarEvento(cuerpo: unknown): ResultadoDeEvento;
  // La reconciliación: null si todavía no hay ninguna transacción.
  consultarTransaccion(referencia: string): Promise<Transaccion | null>;
  probarConexion(): Promise<{ ok: boolean; mensaje: string }>;
}
