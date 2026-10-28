import { describe, expect, it } from 'vitest';
import { agruparPorPagador, formatearNit, lineasDelAbono, repartirAbono } from './empresas';
import { lineasIniciales, puedeCerrarCuentas } from './pagos';

describe('empresas', () => {
  it('formatea el NIT con puntos y el dígito de verificación', () => {
    expect(formatearNit('900123456', '8')).toBe('900.123.456-8');
    expect(formatearNit('800197268')).toBe('800.197.268');
  });

  it('reparte un abono de la salida más antigua a la más reciente', () => {
    const reparto = repartirAbono(250000, [
      { reservaId: 'b', saldo: 160000, fechaSalida: '2030-03-20' },
      { reservaId: 'a', saldo: 160000, fechaSalida: '2030-03-12' },
      { reservaId: 'c', saldo: 0, fechaSalida: '2030-03-01' },
    ]);
    expect(reparto).toEqual({ a: 160000, b: 90000 });
    expect(lineasDelAbono({ ...reparto, c: 0 })).toEqual({
      pagos: [
        { reservaId: 'a', monto: 160000 },
        { reservaId: 'b', monto: 90000 },
      ],
      total: 250000,
    });
  });
});

describe('cuentas por cobrar', () => {
  it('agrupa por quién paga: huéspedes primero y luego cada empresa', () => {
    const viajes = { id: 'v', razonSocial: 'Viajes' };
    const grupos = agruparPorPagador([
      { saldo: 100, empresa: viajes },
      { saldo: 50, empresa: null },
      { saldo: 30, empresa: viajes },
    ]);
    expect(grupos.map((g) => [g.titulo, g.total, g.cuentas.length])).toEqual([
      ['Huéspedes', 50, 1],
      ['Viajes', 130, 2],
    ]);
  });
});

describe('check-out con empresa', () => {
  const pendientes = { huesped: 12000, empresa: 160000 };

  it('con crédito, solo se cobra lo del huésped', () => {
    const lineas = lineasIniciales(pendientes, 'efectivo', true);
    expect(lineas).toEqual([
      { tipo: 'abono', medio: 'efectivo', monto: 12000, responsable: 'huesped' },
    ]);
    const opciones = { cerrarConSaldo: false, saldoAFavor: false, empresaConCredito: true };
    expect(puedeCerrarCuentas(pendientes, lineas, opciones)).toBe(true);
    expect(puedeCerrarCuentas(pendientes, [], opciones)).toBe(false);
  });

  it('sin crédito, la empresa también paga al salir', () => {
    const lineas = lineasIniciales(pendientes, 'tarjeta', false);
    expect(lineas).toHaveLength(2);
    const opciones = { cerrarConSaldo: false, saldoAFavor: false, empresaConCredito: false };
    expect(puedeCerrarCuentas(pendientes, lineas, opciones)).toBe(true);
    expect(puedeCerrarCuentas(pendientes, lineas.slice(0, 1), opciones)).toBe(false);
    expect(
      puedeCerrarCuentas(pendientes, lineas.slice(0, 1), { ...opciones, cerrarConSaldo: true }),
    ).toBe(true);
  });
});
