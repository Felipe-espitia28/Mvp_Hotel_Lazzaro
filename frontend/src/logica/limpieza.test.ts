import { describe, expect, it } from 'vitest';
import type { TareaLimpieza } from '../api/types';
import { avancePorPersona, siguientePaso } from './limpieza';

const tarea = (cambios: Partial<TareaLimpieza>): TareaLimpieza => ({
  id: 't',
  fecha: '2030-01-01',
  tipo: 'salida',
  estado: 'pendiente',
  inicio: null,
  fin: null,
  observaciones: null,
  habitacion: { id: 'h', numero: '101', piso: 1, estado: 'en_limpieza' },
  asignadaA: null,
  ...cambios,
});

describe('limpieza', () => {
  it('el botón de la camarera inicia, luego termina, y después no hay nada', () => {
    expect(siguientePaso({ estado: 'pendiente' })).toBe('iniciar');
    expect(siguientePaso({ estado: 'en_proceso' })).toBe('terminar');
    expect(siguientePaso({ estado: 'terminada' })).toBeNull();
  });

  it('agrupa el avance por persona, con las sin asignar al final', () => {
    const rosa = { id: 'r', nombre: 'Rosa' };
    const ana = { id: 'a', nombre: 'Ana' };
    expect(
      avancePorPersona([
        tarea({ asignadaA: rosa, estado: 'terminada' }),
        tarea({ asignadaA: rosa }),
        tarea({}),
        tarea({ asignadaA: ana, estado: 'terminada' }),
      ]),
    ).toEqual([
      { nombre: 'Ana', total: 1, terminadas: 1, porcentaje: 100 },
      { nombre: 'Rosa', total: 2, terminadas: 1, porcentaje: 50 },
      { nombre: 'Sin asignar', total: 1, terminadas: 0, porcentaje: 0 },
    ]);
  });
});
