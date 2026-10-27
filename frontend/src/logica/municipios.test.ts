import { describe, expect, it } from 'vitest';
import { etiquetaMunicipio } from './municipios';

describe('municipios de la DIVIPOLA (A-6)', () => {
  it('muestra el municipio con su departamento', () => {
    expect(
      etiquetaMunicipio({ codigo: '05001', nombre: 'Medellín', departamento: 'Antioquia' }),
    ).toBe('Medellín, Antioquia');
  });

  it('no repite el nombre cuando municipio y departamento coinciden', () => {
    expect(
      etiquetaMunicipio({ codigo: '11001', nombre: 'Bogotá, D.C.', departamento: 'Bogotá, D.C.' }),
    ).toBe('Bogotá, D.C.');
  });
});
