import type {
  EstadoTareaLimpieza,
  PrioridadIncidencia,
  TareaLimpieza,
  TipoTareaLimpieza,
} from '../api/types';

// B-4: textos y agrupaciones de la limpieza (sin React, para probarlos).

export const ETIQUETA_TIPO_TAREA: Record<TipoTareaLimpieza, string> = {
  salida: 'Salida',
  repaso: 'Repaso',
  profunda: 'Profunda',
};

export const ETIQUETA_ESTADO_TAREA: Record<EstadoTareaLimpieza, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  terminada: 'Terminada',
};

export const ETIQUETA_PRIORIDAD: Record<PrioridadIncidencia, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
};

// El siguiente paso de una tarea para el botón grande de la camarera.
export function siguientePaso(tarea: Pick<TareaLimpieza, 'estado'>) {
  if (tarea.estado === 'pendiente') return 'iniciar' as const;
  if (tarea.estado === 'en_proceso') return 'terminar' as const;
  return null;
}

// Avance por persona para "Limpieza de hoy" (las sin asignar, aparte).
export function avancePorPersona(tareas: TareaLimpieza[]) {
  const grupos = new Map<string, { nombre: string; total: number; terminadas: number }>();
  for (const t of tareas) {
    const clave = t.asignadaA?.id ?? '';
    const grupo = grupos.get(clave) ?? {
      nombre: t.asignadaA?.nombre ?? 'Sin asignar',
      total: 0,
      terminadas: 0,
    };
    grupo.total++;
    if (t.estado === 'terminada') grupo.terminadas++;
    grupos.set(clave, grupo);
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, porcentaje: Math.round((g.terminadas / g.total) * 100) }))
    .sort((a, b) =>
      a.nombre === 'Sin asignar'
        ? 1
        : b.nombre === 'Sin asignar'
          ? -1
          : a.nombre.localeCompare(b.nombre),
    );
}
