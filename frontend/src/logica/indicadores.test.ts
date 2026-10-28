import { describe, expect, it } from 'vitest';
import { periodo, textoVariacion } from './indicadores';

describe('periodo', () => {
  it('este mes va del primero al último día del mes', () => {
    expect(periodo('este_mes', '2030-02-10')).toEqual({ desde: '2030-02-01', hasta: '2030-02-28' });
  });

  it('el mes anterior cruza el año en enero', () => {
    expect(periodo('mes_anterior', '2030-01-10')).toEqual({
      desde: '2029-12-01',
      hasta: '2029-12-31',
    });
  });

  it('los últimos 30 días incluyen hoy', () => {
    expect(periodo('ultimos_30', '2030-03-10')).toEqual({
      desde: '2030-02-09',
      hasta: '2030-03-10',
    });
  });
});

describe('textoVariacion', () => {
  it('muestra la flecha y el porcentaje', () => {
    expect(textoVariacion(12.5)).toEqual({ texto: '▲ 12,5 %', tono: 'sube' });
    expect(textoVariacion(-3)).toEqual({ texto: '▼ 3 %', tono: 'baja' });
    expect(textoVariacion(0)).toEqual({ texto: '= 0 %', tono: 'neutro' });
  });

  it('sin período anterior no inventa un porcentaje', () => {
    expect(textoVariacion(null).texto).toBe('Sin datos del período anterior');
  });
});
