// Pruebas unitarias del estado de cuenta del folio: sin base de datos ni NestJS.
import { aplicarAnticipos, calcularSaldo, loQueSeDebe } from './estado-de-cuenta';

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
