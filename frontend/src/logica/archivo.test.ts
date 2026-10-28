import { describe, expect, it } from 'vitest';
import { filasDeCsv, filasDeHoja } from './archivo';

describe('lectura del archivo a importar', () => {
  it('lee un CSV de Excel (BOM y ";") con tildes y sin filas en blanco', () => {
    const texto =
      '\uFEFFNúmero;Tipo;Descripción\r\n101;doble;Vista al jardín\r\n;;\r\n102;suite;\r\n';
    expect(filasDeCsv(texto)).toEqual([
      { Número: '101', Tipo: 'doble', Descripción: 'Vista al jardín' },
      { Número: '102', Tipo: 'suite', Descripción: '' },
    ]);
  });

  it('también lee un CSV separado por comas', () => {
    expect(filasDeCsv('numero,tipo\n201,doble\n')).toEqual([{ numero: '201', tipo: 'doble' }]);
  });

  it('una hoja de Excel usa la primera fila como encabezados', () => {
    expect(
      filasDeHoja([
        [' Número ', 'Tipo', null],
        [101, 'doble', 'ignorada'],
        [102, null],
      ]),
    ).toEqual([
      { Número: 101, Tipo: 'doble' },
      { Número: 102, Tipo: null },
    ]);
  });
});
