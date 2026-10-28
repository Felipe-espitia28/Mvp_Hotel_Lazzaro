import type { MedioPago } from '../api/types';
import { formatearDinero } from '../formato';

// Pagos del folio (A-1), sin React para poder probarlos. Solo ayudan a
// recepción a cuadrar el check-out: el saldo real lo calcula el backend.

export interface LineaPago {
  tipo: 'abono' | 'reembolso';
  medio: MedioPago;
  monto: number;
  referencia?: string;
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
