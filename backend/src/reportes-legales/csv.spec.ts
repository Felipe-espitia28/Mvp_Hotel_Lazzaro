// Pruebas unitarias del CSV de los reportes legales: sin base de datos ni NestJS.
import { aCsv } from './csv';

describe('CSV de los reportes legales (A-6)', () => {
  const columnas = [
    { clave: 'nombre' as const, encabezado: 'Nombre' },
    { clave: 'ciudad' as const, encabezado: 'Ciudad' },
  ];

  it('empieza con el BOM, separa con ";" y termina cada línea con CRLF', () => {
    expect(aCsv(columnas, [{ nombre: 'Ana', ciudad: 'Cali' }])).toBe(
      '\uFEFFNombre;Ciudad\r\nAna;Cali\r\n',
    );
  });

  it('pone entre comillas los valores con ";", comillas o saltos de línea', () => {
    const csv = aCsv(columnas, [
      { nombre: 'Ana; María', ciudad: 'Cali' },
      { nombre: 'Luis "Lucho"', ciudad: 'Bogotá\nD.C.' },
    ]);
    expect(csv.split('\r\n').slice(1, 3)).toEqual([
      '"Ana; María";Cali',
      '"Luis ""Lucho""";"Bogotá\nD.C."',
    ]);
  });

  it('un valor vacío o nulo queda como celda vacía', () => {
    expect(aCsv(columnas, [{ nombre: 'Ana', ciudad: null }])).toBe(
      '\uFEFFNombre;Ciudad\r\nAna;\r\n',
    );
  });
});
