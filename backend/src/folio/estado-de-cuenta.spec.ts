// Pruebas unitarias del estado de cuenta del folio: sin base de datos ni NestJS.
import {
  alojamientoDe,
  aplicarAnticipos,
  calcularSaldo,
  loQueSeDebe,
  subcuentas,
} from './estado-de-cuenta';

const pago = (tipo: 'abono' | 'anticipo' | 'reembolso', monto: number, anulado = false) => ({
  tipo,
  monto,
  anulado,
});

describe('Estado de cuenta (A-1)', () => {
  it('sin pagos, el saldo es lo que se debe', () => {
    expect(calcularSaldo({ debe: 300000, pagos: [] })).toEqual({
      debe: 300000,
      pagado: 0,
      reembolsado: 0,
      saldo: 300000,
    });
  });

  it('los abonos y anticipos restan; los anulados no cuentan', () => {
    const { saldo, pagado } = calcularSaldo({
      debe: 300000,
      pagos: [pago('anticipo', 100000), pago('abono', 50000), pago('abono', 80000, true)],
    });
    expect([pagado, saldo]).toEqual([150000, 150000]);
  });

  it('pagar de más deja saldo a favor, y el reembolso lo devuelve a 0', () => {
    expect(calcularSaldo({ debe: 100000, pagos: [pago('abono', 130000)] }).saldo).toBe(-30000);
    expect(
      calcularSaldo({ debe: 100000, pagos: [pago('abono', 130000), pago('reembolso', 30000)] })
        .saldo,
    ).toBe(0);
  });

  it('el anticipo se aplica a la penalidad: lo que sobra se devuelve (A-2)', () => {
    expect(aplicarAnticipos(80000, [pago('anticipo', 100000)])).toEqual({
      penalidad: 80000,
      anticipos: 100000,
      aDevolver: 20000,
      porCobrar: 0,
    });
    // Cancelación gratuita: se devuelve completo; un anticipo anulado no cuenta.
    expect(
      aplicarAnticipos(0, [pago('anticipo', 90000), pago('anticipo', 5000, true)]).aDevolver,
    ).toBe(90000);
    // Un anticipo menor que la penalidad deja el resto por cobrar.
    expect(aplicarAnticipos(80000, [pago('anticipo', 30000)])).toMatchObject({
      aDevolver: 0,
      porCobrar: 50000,
    });
  });

  it('lo que se debe: el total liquidado, o el alojamiento más los consumos', () => {
    expect(loQueSeDebe({ total: 80000, valorAlojamiento: 300000, cargos: 0 })).toBe(80000);
    expect(loQueSeDebe({ total: 0, valorAlojamiento: 300000, cargos: 0 })).toBe(0);
    expect(loQueSeDebe({ total: null, valorAlojamiento: 300000, cargos: 25000 })).toBe(325000);
  });
});

describe('subcuentas (B-5)', () => {
  const pago = (monto: number, responsable: 'huesped' | 'empresa', tipo = 'abono' as const) => ({
    tipo,
    monto,
    anulado: false,
    responsable,
  });

  it('el alojamiento va a la empresa y cada cargo y pago a su responsable', () => {
    const cuenta = subcuentas({
      alojamiento: 160000,
      alojamientoDe: 'empresa',
      cargos: [
        { total: 12000, responsable: 'huesped', anulado: false },
        { total: 30000, responsable: 'empresa', anulado: false },
        { total: 5000, responsable: 'huesped', anulado: true },
      ],
      pagos: [pago(12000, 'huesped'), pago(100000, 'empresa')],
    });
    expect(cuenta.huesped).toMatchObject({ debe: 12000, pagado: 12000, saldo: 0 });
    expect(cuenta.empresa).toMatchObject({ debe: 190000, pagado: 100000, saldo: 90000 });
  });

  it('sin empresa todo queda del huésped', () => {
    const cuenta = subcuentas({
      alojamiento: 80000,
      alojamientoDe: 'huesped',
      cargos: [{ total: 10000, responsable: 'huesped', anulado: false }],
      pagos: [],
    });
    expect(cuenta.huesped.saldo).toBe(90000);
    expect(cuenta.empresa).toEqual({ debe: 0, pagado: 0, reembolsado: 0, saldo: 0 });
  });

  it('el alojamiento liquidado es el total menos los consumos', () => {
    expect(alojamientoDe({ total: null, valorAlojamiento: 160000, consumos: 12000 })).toBe(160000);
    expect(alojamientoDe({ total: 92000, valorAlojamiento: 160000, consumos: 12000 })).toBe(80000);
  });
});
