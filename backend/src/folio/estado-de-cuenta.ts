// A-1: estado de cuenta del folio. El saldo nunca se guarda: se calcula del
// libro de pagos cada vez. Sin NestJS ni Prisma: se prueba sin base de datos.
// Los montos llegan como número de pesos (los Decimal se convierten antes).

export type TipoPago = 'abono' | 'anticipo' | 'reembolso';

export interface PagoDeCuenta {
  tipo: TipoPago;
  monto: number;
  anulado: boolean;
}

export interface Cuenta {
  // Lo que se debe: el total liquidado (cerrada, cancelada, no-show) o, si
  // aún no se liquida, el alojamiento pactado más los consumos vigentes.
  debe: number;
  pagos: PagoDeCuenta[];
}

// Al peso, como el resto de los montos (motor-tarificacion.ts).
const pesos = (valor: number) => Math.round(valor * 100) / 100;

// Positivo = el huésped debe; negativo = tiene saldo a favor.
export function calcularSaldo({ debe, pagos }: Cuenta) {
  const vigentes = pagos.filter((p) => !p.anulado);
  const pagado = vigentes.filter((p) => p.tipo !== 'reembolso').reduce((s, p) => s + p.monto, 0);
  const reembolsado = vigentes
    .filter((p) => p.tipo === 'reembolso')
    .reduce((s, p) => s + p.monto, 0);
  return {
    debe: pesos(debe),
    pagado: pesos(pagado),
    reembolsado: pesos(reembolsado),
    saldo: pesos(debe - pagado + reembolsado),
  };
}

// Lo que se debe de una reserva (ver Cuenta.debe).
export function loQueSeDebe(reserva: {
  total: number | null;
  valorAlojamiento: number;
  cargos: number;
}) {
  return reserva.total ?? reserva.valorAlojamiento + reserva.cargos;
}
