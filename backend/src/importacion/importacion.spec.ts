import {
  aEntero,
  aFecha,
  armarInforme,
  esFilaVacia,
  normalizarEncabezado,
  normalizarFila,
} from './importacion';

describe('importación', () => {
  it('normaliza los encabezados con tildes, mayúsculas y espacios', () => {
    expect(normalizarEncabezado('  Número ')).toBe('numero');
    expect(normalizarEncabezado('DESCRIPCIÓN')).toBe('descripcion');
    expect(normalizarEncabezado('Tipo_de habitación')).toBe('tipodehabitacion');
    expect(normalizarEncabezado('Nº')).toBe('n');
  });

  it('pasa las columnas a sus nombres canónicos y descarta las desconocidas', () => {
    const alias = { numero: ['número', 'habitación'], tipo: ['código del tipo'] };
    expect(
      normalizarFila({ ' Habitación ': '101', 'CÓDIGO DEL TIPO': 'doble', Notas: 'x' }, alias),
    ).toEqual({ numero: '101', tipo: 'doble' });
  });

  it('las filas vacías se ignoran', () => {
    expect(esFilaVacia({ numero: '', tipo: '  ', piso: null })).toBe(true);
    expect(esFilaVacia({ numero: '101', tipo: '' })).toBe(false);
  });

  it('convierte enteros y fechas, y distingue vacío de inválido', () => {
    expect(aEntero(' 3 ')).toBe(3);
    expect(aEntero(2)).toBe(2);
    expect(aEntero('')).toBeUndefined();
    expect(aEntero('tres')).toBeNull();
    expect(aEntero('1.5')).toBeNull();

    expect(aFecha('5/3/2030')).toBe('2030-03-05');
    expect(aFecha('2030-03-05')).toBe('2030-03-05');
    expect(aFecha(new Date('2030-03-05T00:00:00Z'))).toBe('2030-03-05');
    expect(aFecha('31/02/2030')).toBeNull();
    expect(aFecha('mañana')).toBeNull();
    expect(aFecha(undefined)).toBeUndefined();
  });

  it('el informe cuenta las filas por estado', () => {
    const informe = armarInforme([
      { fila: 2, numero: '101', estado: 'crear', errores: [] },
      { fila: 3, numero: '102', estado: 'actualizar', errores: [] },
      { fila: 4, numero: '103', estado: 'crear', errores: [] },
      { fila: 5, numero: '', estado: 'error', errores: ['Falta el número'] },
    ]);
    expect(informe.resumen).toEqual({ total: 4, crear: 2, actualizar: 1, error: 1 });
  });
});
