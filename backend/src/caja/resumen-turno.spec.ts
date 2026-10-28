// Pruebas unitarias del cuadre de un turno de caja (B-3).
import { PagoDelTurno, diferenciaDeCaja, resumenTurno } from './resumen-turno';

const pago = (cambios: Partial<PagoDelTurno>): PagoDelTurno => ({
  tipo: 'abono',
  medio: 'efectivo',
  monto: 0,
  turnoId: 'T1',
  anulado: false,
  anuladoTurnoId: null,
  ...cambios,
});

describe('Cuadre del turno', () => {
  // Base $100.000; abonos en efectivo de $80.000 y $50.000, uno con tarjeta de
  // $200.000 y un reembolso en efectivo de $30.000:
  //   efectivo neto = 80.000 + 50.000 − 30.000 = 100.000
  //   esperado en efectivo = 100.000 + 100.000 = $200.000
  const pagos = [
    pago({ monto: 80000 }),
    pago({ monto: 50000, tipo: 'anticipo' }),
    pago({ monto: 200000, medio: 'tarjeta' }),
    pago({ monto: 30000, tipo: 'reembolso' }),
  ];

  it('suma por medio y calcula el efectivo esperado', () => {
    const r = resumenTurno('T1', 100000, pagos);
    expect(r.porMedio).toEqual([
      { medio: 'efectivo', ingresos: 130000, reembolsos: 30000, ajustes: 0, neto: 100000 },
      { medio: 'tarjeta', ingresos: 200000, reembolsos: 0, ajustes: 0, neto: 200000 },
    ]);
    expect(r.esperadoEfectivo).toBe(200000);
    expect(r.totales).toEqual({ ingresos: 330000, reembolsos: 30000, ajustes: 0, neto: 300000 });
  });

  it('la diferencia es lo contado menos lo esperado', () => {
    expect(diferenciaDeCaja(190000, 200000)).toBe(-10000);
    expect(diferenciaDeCaja(200000, 200000)).toBe(0);
  });

  it('un pago anulado en su mismo turno no cuenta', () => {
    const r = resumenTurno('T1', 0, [pago({ monto: 80000, anulado: true, anuladoTurnoId: 'T1' })]);
    expect(r.porMedio).toEqual([]);
    expect(r.esperadoEfectivo).toBe(0);
  });

  it('anulado en otro turno: sigue en el suyo y es un ajuste en el que lo anuló', () => {
    const anulado = pago({ monto: 80000, anulado: true, anuladoTurnoId: 'T2' });
    expect(resumenTurno('T1', 0, [anulado]).esperadoEfectivo).toBe(80000);
    const enT2 = resumenTurno('T2', 50000, [anulado]);
    expect(enT2.porMedio).toEqual([
      { medio: 'efectivo', ingresos: 0, reembolsos: 0, ajustes: -80000, neto: -80000 },
    ]);
    expect(enT2.esperadoEfectivo).toBe(-30000);
  });

  it('anular un reembolso de otro turno es un ajuste positivo', () => {
    const r = resumenTurno('T2', 0, [
      pago({ tipo: 'reembolso', monto: 30000, anulado: true, anuladoTurnoId: 'T2' }),
    ]);
    expect(r.totales.ajustes).toBe(30000);
  });

  it('anulado sin turno: el pago sigue contando en el suyo', () => {
    const r = resumenTurno('T1', 0, [pago({ monto: 80000, anulado: true, anuladoTurnoId: null })]);
    expect(r.esperadoEfectivo).toBe(80000);
  });
});
