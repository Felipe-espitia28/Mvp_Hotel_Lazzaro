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

// A-2: al cancelar o en un no-show, el anticipo se aplica a la penalidad; lo
// que sobra se devuelve (o queda a favor) y lo que falta queda por cobrar.
export function aplicarAnticipos(penalidad: number, pagos: PagoDeCuenta[]) {
  const anticipos = pagos
    .filter((p) => !p.anulado && p.tipo === 'anticipo')
    .reduce((s, p) => s + p.monto, 0);
  const { saldo } = calcularSaldo({ debe: penalidad, pagos });
  return {
    penalidad: pesos(penalidad),
    anticipos: pesos(anticipos),
    aDevolver: Math.max(0, -saldo),
    porCobrar: Math.max(0, saldo),
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

// B-5: un folio con dos subcuentas. El alojamiento va a la empresa si la
// reserva tiene una (con cualquiera de las dos reglas); cada cargo y cada
// pago, a su responsable. La suma de las dos es la cuenta de siempre.
export type Responsable = 'huesped' | 'empresa';

export interface CuentaDividida {
  alojamiento: number;
  alojamientoDe: Responsable;
  cargos: { total: number; responsable: Responsable; anulado: boolean }[];
  pagos: (PagoDeCuenta & { responsable: Responsable })[];
}

export function subcuentas(cuenta: CuentaDividida) {
  const de = (responsable: Responsable) =>
    calcularSaldo({
      debe:
        (cuenta.alojamientoDe === responsable ? cuenta.alojamiento : 0) +
        cuenta.cargos
          .filter((c) => !c.anulado && c.responsable === responsable)
          .reduce((s, c) => s + c.total, 0),
      pagos: cuenta.pagos.filter((p) => p.responsable === responsable),
    });
  return { huesped: de('huesped'), empresa: de('empresa') };
}

// El alojamiento de una reserva: lo liquidado (total menos los consumos, que
// cubre la salida anticipada y las penalidades) o, si aún no se liquida, lo pactado.
export function alojamientoDe(reserva: {
  total: number | null;
  valorAlojamiento: number;
  consumos: number;
}) {
  return reserva.total === null
    ? reserva.valorAlojamiento
    : pesos(reserva.total - reserva.consumos);
}
