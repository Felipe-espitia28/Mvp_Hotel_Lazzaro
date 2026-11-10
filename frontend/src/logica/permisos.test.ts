import { describe, expect, it } from 'vitest';
import type { EntradaCatalogo, Permiso } from '../api/types';
import { ajustesDesde, desmarcar, diferencias, efectivos, marcar, origen } from './permisos';

const entrada = (clave: Permiso, requiere: Permiso[] = []): EntradaCatalogo => ({
  clave,
  grupo: 'G',
  etiqueta: clave,
  descripcion: '',
  sensible: false,
  requiere,
});
const CATALOGO = [
  entrada('reservas:ver'),
  entrada('reservas:gestionar', ['reservas:ver']),
  entrada('folio:gestionar', ['reservas:ver']),
  entrada('pagos:anular', ['folio:gestionar']),
  entrada('caja:turno'),
];

describe('permisos (plan 19)', () => {
  it('efectivos: el rol con agregados y quitados (gana el quitado)', () => {
    expect(efectivos(['reservas:ver'], ['caja:turno'])).toEqual(['reservas:ver', 'caja:turno']);
    expect(efectivos(['reservas:ver', 'caja:turno'], [], ['caja:turno'])).toEqual(['reservas:ver']);
    expect(efectivos(['reservas:ver'], ['caja:turno'], ['caja:turno'])).toEqual(['reservas:ver']);
  });

  it('el origen de cada permiso y los ajustes que lo producen', () => {
    const delRol: Permiso[] = ['reservas:ver', 'caja:turno'];
    const deseados: Permiso[] = ['reservas:ver', 'folio:gestionar'];
    expect(origen('reservas:ver', delRol, deseados)).toBe('rol');
    expect(origen('caja:turno', delRol, deseados)).toBe('quitado');
    expect(origen('folio:gestionar', delRol, deseados)).toBe('agregado');
    expect(origen('pagos:anular', delRol, deseados)).toBeNull();
    expect(ajustesDesde(delRol, deseados)).toEqual({
      permisosAgregados: ['folio:gestionar'],
      permisosQuitados: ['caja:turno'],
    });
  });

  it('marcar trae sus requisitos; desmarcar se lleva a los que lo necesitan', () => {
    expect(marcar([], 'pagos:anular', CATALOGO).sort()).toEqual([
      'folio:gestionar',
      'pagos:anular',
      'reservas:ver',
    ]);
    const { seleccion, arrastrados } = desmarcar(
      ['reservas:ver', 'reservas:gestionar', 'folio:gestionar', 'pagos:anular', 'caja:turno'],
      'reservas:ver',
      CATALOGO,
    );
    expect(seleccion).toEqual(['caja:turno']);
    expect(arrastrados.sort()).toEqual(['folio:gestionar', 'pagos:anular', 'reservas:gestionar']);
  });

  it('diferencias para la vista previa', () => {
    expect(diferencias(['reservas:ver', 'caja:turno'], ['reservas:ver', 'pagos:anular'])).toEqual({
      ganan: ['pagos:anular'],
      pierden: ['caja:turno'],
    });
  });
});
