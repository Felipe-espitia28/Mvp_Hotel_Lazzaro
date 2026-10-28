import type { MedioPago, Responsable } from '../api/types';
import { formatearDinero } from '../formato';

// Pagos del folio (A-1), sin React para poder probarlos. Solo ayudan a
// recepción a cuadrar el check-out: el saldo real lo calcula el backend.

export interface LineaPago {
  tipo: 'abono' | 'reembolso';
  medio: MedioPago;
  monto: number;
  referencia?: string;
  // B-5: a qué subcuenta va (por defecto, la del huésped).
  responsable?: Responsable;
}

// Positivo = el huésped debe; negativo = tiene saldo a favor.
export type EstadoSaldo = 'debe' | 'saldado' | 'a-favor';
export const estadoSaldo = (saldo: number): EstadoSaldo =>
  saldo > 0 ? 'debe' : saldo < 0 ? 'a-favor' : 'saldado';

// Cómo queda el saldo después de unos pagos: los abonos lo bajan y los reembolsos lo suben.
export const saldoTras = (saldo: number, lineas: LineaPago[]) =>
  lineas.reduce((s, l) => (l.tipo === 'reembolso' ? s + l.monto : s - l.monto), saldo);

// El monto que debe llevar la línea `indice` para que el saldo quede en 0.
export function elResto(saldo: number, lineas: LineaPago[], indice: number) {
  const sinEsta = lineas.filter((_, i) => i !== indice);
  const resto = saldoTras(saldo, sinEsta);
  return Math.max(0, lineas[indice].tipo === 'reembolso' ? -resto : resto);
}

export interface OpcionesCierre {
  cerrarConSaldo: boolean;
  saldoAFavor: boolean;
}

// ¿Se puede confirmar el check-out? El saldo debe quedar en 0, salvo que se
// cierre con saldo pendiente (admin) o se deje el saldo a favor del huésped.
export function puedeCerrar(saldo: number, lineas: LineaPago[], opciones: OpcionesCierre) {
  if (lineas.some((l) => !(l.monto > 0))) return false;
  const final = saldoTras(saldo, lineas);
  if (final > 0) return opciones.cerrarConSaldo;
  if (final < 0) return opciones.saldoAFavor;
  return true;
}

// B-5: con empresa, cada subcuenta se cuadra con sus propias líneas.
export type Pendientes = Record<Responsable, number>;
const de = (lineas: LineaPago[], r: Responsable) =>
  lineas.filter((l) => (l.responsable ?? 'huesped') === r);

export const saldosTras = (pendientes: Pendientes, lineas: LineaPago[]): Pendientes => ({
  huesped: saldoTras(pendientes.huesped, de(lineas, 'huesped')),
  empresa: saldoTras(pendientes.empresa, de(lineas, 'empresa')),
});

// Como elResto, pero con las líneas de la misma subcuenta.
export function elRestoDe(pendientes: Pendientes, lineas: LineaPago[], indice: number) {
  const r = lineas[indice].responsable ?? 'huesped';
  const misma = de(lineas, r);
  return elResto(pendientes[r], misma, misma.indexOf(lineas[indice]));
}

// La del huésped queda en 0 (o con el permiso de cerrar con saldo); la de la
// empresa puede quedar pendiente si tiene crédito. Un saldo a favor, de
// cualquiera, se deja a favor a propósito.
export function puedeCerrarCuentas(
  pendientes: Pendientes,
  lineas: LineaPago[],
  opciones: OpcionesCierre & { empresaConCredito: boolean },
) {
  if (lineas.some((l) => !(l.monto > 0))) return false;
  const final = saldosTras(pendientes, lineas);
  if (final.huesped > 0 && !opciones.cerrarConSaldo) return false;
  if (final.empresa > 0 && !opciones.empresaConCredito && !opciones.cerrarConSaldo) return false;
  if ((final.huesped < 0 || final.empresa < 0) && !opciones.saldoAFavor) return false;
  return true;
}

// Las líneas con que arranca el check-out: lo pendiente de cada subcuenta (lo
// de una empresa con crédito no se cobra ahora).
export function lineasIniciales(
  pendientes: Pendientes,
  medio: MedioPago,
  empresaConCredito: boolean,
): LineaPago[] {
  return (['huesped', 'empresa'] as const)
    .filter(
      (r) => pendientes[r] !== 0 && !(r === 'empresa' && empresaConCredito && pendientes[r] > 0),
    )
    .map((r) => ({
      tipo: pendientes[r] > 0 ? ('abono' as const) : ('reembolso' as const),
      medio,
      monto: Math.abs(pendientes[r]),
      responsable: r,
    }));
}

// El aviso al terminar el check-out, con lo que quedó pendiente o a favor.
export function avisoCheckOut(huesped: string, cerrada: { total: string | null; saldo: number }) {
  const base = `Check-out de ${huesped}: total ${formatearDinero(cerrada.total ?? 0)}.`;
  if (cerrada.saldo > 0) return `${base} Queda ${formatearDinero(cerrada.saldo)} por cobrar.`;
  if (cerrada.saldo < 0)
    return `${base} Quedan ${formatearDinero(-cerrada.saldo)} a favor del huésped.`;
  return base;
}

// A-2: el anticipo sugerido de una reserva (porcentaje del hotel × total, al
// peso), como lo calcula el backend al reservar.
export const anticipoSugerido = (total: number, porcentaje: number) =>
  Math.round((total * porcentaje) / 100);
