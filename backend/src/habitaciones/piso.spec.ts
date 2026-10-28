import { numerosDelRango, pisoDelNumero } from './piso';

describe('piso y rango de habitaciones', () => {
  it('infiere el piso de los números de 3 o más dígitos', () => {
    expect(pisoDelNumero('101')).toBe(1);
    expect(pisoDelNumero('1203')).toBe(12);
    expect(pisoDelNumero('12')).toBeNull();
    expect(pisoDelNumero('A-101')).toBeNull();
  });

  it('arma el rango con el prefijo y los ceros de "desde"', () => {
    expect(numerosDelRango('101', '103')).toEqual(['101', '102', '103']);
    expect(numerosDelRango('08', '10', 'C-')).toEqual(['C-08', 'C-09', 'C-10']);
  });
});
