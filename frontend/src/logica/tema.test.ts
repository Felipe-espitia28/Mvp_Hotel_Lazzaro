import { describe, expect, it } from 'vitest';
import { contraste, generarTema, hexAHsl, hslAHex } from './tema';

const marca = (colorPrimario: string, colorAcento: string) => ({
  colorPrimario,
  colorAcento,
  fuenteTitulos: 'Montserrat',
  fuenteTexto: 'Nunito Sans',
});

describe('tema de la marca del hotel', () => {
  it('convierte entre hexadecimal y HSL sin perder el color', () => {
    for (const color of ['#0f1b2d', '#c9a227', '#0e6e78', '#f2994a']) {
      expect(hslAHex(hexAHsl(color))).toBe(color);
    }
  });

  it('mide el contraste como WCAG', () => {
    expect(contraste('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contraste('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });

  it('respeta los colores del hotel cuando se leen bien', () => {
    const { variables, avisos } = generarTema(marca('#0e6e78', '#f2994a'));
    expect(variables['--marca-900']).toBe('#0e6e78');
    expect(variables['--dorado-500']).toBe('#f2994a');
    expect(avisos).toEqual([]);
    expect(variables['--fuente-titulos']).toContain('Montserrat');
    expect(variables['--fuente']).toContain('Nunito Sans');
  });

  it('oscurece un principal demasiado claro para el texto blanco y lo avisa', () => {
    const { variables, avisos } = generarTema(marca('#9ad0f5', '#c9a227'));
    expect(variables['--marca-900']).not.toBe('#9ad0f5');
    expect(contraste(variables['--marca-900'], '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(avisos).toHaveLength(1);
  });

  it('todos los tonos clave cumplen el contraste mínimo', () => {
    for (const [p, a] of [
      ['#0f1b2d', '#c9a227'],
      ['#0e6e78', '#f2994a'],
      ['#7b2d26', '#e9c46a'],
      ['#ffe8f0', '#ffd400'],
    ]) {
      const { variables } = generarTema(marca(p, a));
      expect(contraste(variables['--marca-900'], '#ffffff')).toBeGreaterThanOrEqual(4.5);
      expect(contraste(variables['--marca-700'], '#ffffff')).toBeGreaterThanOrEqual(4.5);
      expect(contraste(variables['--dorado-600'], '#eaf4fb')).toBeGreaterThanOrEqual(4.5);
      expect(
        contraste(variables['--dorado-500'], variables['--texto-acento']),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});
