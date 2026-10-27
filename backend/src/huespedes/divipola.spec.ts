// Pruebas unitarias de los municipios de la DIVIPOLA: sin base de datos ni NestJS.
import { MUNICIPIOS, codigoMunicipio, etiquetaMunicipio } from './divipola';

describe('DIVIPOLA (A-6)', () => {
  it('trae todos los municipios del DANE, con código único de 5 dígitos', () => {
    expect(MUNICIPIOS).toHaveLength(1122);
    expect(new Set(MUNICIPIOS.map((m) => m.codigo)).size).toBe(1122);
    expect(MUNICIPIOS.every((m) => /^\d{5}$/.test(m.codigo))).toBe(true);
  });

  it('muestra el municipio con su departamento', () => {
    const medellin = MUNICIPIOS.find((m) => m.codigo === '05001')!;
    expect(etiquetaMunicipio(medellin)).toBe('Medellín, Antioquia');
    const bogota = MUNICIPIOS.find((m) => m.codigo === '11001')!;
    expect(etiquetaMunicipio(bogota)).toBe('Bogotá, D.C.');
  });

  it('reconoce el código sin importar tildes, mayúsculas ni el nombre de uso común', () => {
    expect(codigoMunicipio('Medellín, Antioquia')).toBe('05001');
    expect(codigoMunicipio('medellin')).toBe('05001');
    expect(codigoMunicipio('Cali, Valle del Cauca')).toBe('76001');
    expect(codigoMunicipio('Santiago de Cali')).toBe('76001');
    expect(codigoMunicipio('Cali')).toBe('76001');
    expect(codigoMunicipio('Bogotá')).toBe('11001');
    expect(codigoMunicipio('BOGOTA, D.C.')).toBe('11001');
  });

  it('no adivina: un nombre repetido sin departamento, o una ciudad desconocida, no tiene código', () => {
    expect(codigoMunicipio('La Unión')).toBeNull();
    expect(codigoMunicipio('La Unión, Nariño')).toMatch(/^52\d{3}$/);
    expect(codigoMunicipio('Miami')).toBeNull();
    expect(codigoMunicipio('')).toBeNull();
    expect(codigoMunicipio(null)).toBeNull();
  });
});
