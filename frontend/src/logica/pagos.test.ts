import { describe, expect, it } from 'vitest';
import {
  avisoCheckOut,
  elResto,
  estadoSaldo,
  puedeCerrar,
  saldoTras,
  type LineaPago,
} from './pagos';

const abono = (monto: number, medio: LineaPago['medio'] = 'efectivo'): LineaPago => ({
  tipo: 'abono',
  medio,
  monto,
});
const sinOpciones = { cerrarConSaldo: false, saldoAFavor: false };

describe('pagos del check-out (A-1)', () => {
  it('el estado del saldo', () => {
    expect([estadoSaldo(1000), estadoSaldo(0), estadoSaldo(-1)]).toEqual([
      'debe',
      'saldado',
      'a-favor',
    ]);
  });

  it('los abonos bajan el saldo y los reembolsos lo suben', () => {
    expect(saldoTras(400000, [abono(300000), abono(50000, 'tarjeta')])).toBe(50000);
    expect(saldoTras(-40000, [{ tipo: 'reembolso', medio: 'efectivo', monto: 40000 }])).toBe(0);
  });

  it('"el resto" deja el saldo en 0 con la línea elegida', () => {
    const lineas = [abono(300000), abono(0, 'tarjeta')];
    expect(elResto(400000, lineas, 1)).toBe(100000);
    // Si las demás ya cubren todo, el resto es 0.
    expect(elResto(200000, lineas, 1)).toBe(0);
  });

  it('solo se confirma cuando el saldo queda en 0', () => {
    expect(puedeCerrar(400000, [abono(300000)], sinOpciones)).toBe(false);
    expect(puedeCerrar(400000, [abono(300000), abono(100000, 'tarjeta')], sinOpciones)).toBe(true);
    expect(puedeCerrar(0, [], sinOpciones)).toBe(true);
    // Una línea sin monto no se envía.
    expect(puedeCerrar(0, [abono(0)], sinOpciones)).toBe(false);
  });

  it('o con saldo pendiente (admin), o dejando el saldo a favor', () => {
    expect(puedeCerrar(400000, [abono(300000)], { ...sinOpciones, cerrarConSaldo: true })).toBe(
      true,
    );
    expect(puedeCerrar(-10000, [], sinOpciones)).toBe(false);
    expect(puedeCerrar(-10000, [], { ...sinOpciones, saldoAFavor: true })).toBe(true);
  });

  it('el aviso del check-out dice si quedó algo por cobrar o a favor', () => {
    expect(avisoCheckOut('Ana', { total: '160000', saldo: 0 })).toBe(
      'Check-out de Ana: total $160.000.',
    );
    expect(avisoCheckOut('Ana', { total: '160000', saldo: 60000 })).toMatch(
      /Queda \$60\.000 por cobrar/,
    );
    expect(avisoCheckOut('Ana', { total: '160000', saldo: -10000 })).toMatch(/\$10\.000 a favor/);
  });
});
