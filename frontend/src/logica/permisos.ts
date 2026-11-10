import type { EntradaCatalogo, Permiso } from '../api/types';

// Plan 19: los permisos en pantalla (sin React, para probarlos). Solo ayudan
// a armar un rol o los ajustes de una persona: la regla real la aplica el backend.

// R75: (los del rol ∪ agregados) − quitados.
export function efectivos(
  delRol: readonly Permiso[],
  agregados: readonly Permiso[] = [],
  quitados: readonly Permiso[] = [],
): Permiso[] {
  const quitar = new Set(quitados);
  return [...new Set([...delRol, ...agregados])].filter((p) => !quitar.has(p));
}

export type Origen = 'rol' | 'agregado' | 'quitado' | null;

// De dónde sale un permiso de una persona: de su rol, agregado o quitado.
export function origen(
  clave: Permiso,
  delRol: readonly Permiso[],
  deseados: readonly Permiso[],
): Origen {
  const enRol = delRol.includes(clave);
  const tiene = deseados.includes(clave);
  if (enRol && tiene) return 'rol';
  if (enRol && !tiene) return 'quitado';
  if (!enRol && tiene) return 'agregado';
  return null;
}

// Los ajustes que llevan de los permisos del rol a los deseados.
export function ajustesDesde(delRol: readonly Permiso[], deseados: readonly Permiso[]) {
  return {
    permisosAgregados: deseados.filter((p) => !delRol.includes(p)),
    permisosQuitados: delRol.filter((p) => !deseados.includes(p)),
  };
}

const requisitos = (catalogo: readonly EntradaCatalogo[]) =>
  new Map(catalogo.map((e) => [e.clave, e.requiere]));

// Marcar un permiso marca también lo que necesita (y lo que eso necesita).
export function marcar(
  seleccion: readonly Permiso[],
  clave: Permiso,
  catalogo: readonly EntradaCatalogo[],
): Permiso[] {
  const requiere = requisitos(catalogo);
  const resultado = new Set(seleccion);
  const pendientes = [clave];
  while (pendientes.length > 0) {
    const actual = pendientes.pop()!;
    if (resultado.has(actual) && actual !== clave) continue;
    resultado.add(actual);
    pendientes.push(...(requiere.get(actual) ?? []));
  }
  return [...resultado];
}

// Desmarcar uno desmarca también los que lo necesitan; devuelve cuáles se
// arrastraron, para avisarlo.
export function desmarcar(
  seleccion: readonly Permiso[],
  clave: Permiso,
  catalogo: readonly EntradaCatalogo[],
) {
  const requiere = requisitos(catalogo);
  const quitar = new Set<Permiso>([clave]);
  let cambio = true;
  while (cambio) {
    cambio = false;
    for (const p of seleccion) {
      if (!quitar.has(p) && (requiere.get(p) ?? []).some((r) => quitar.has(r))) {
        quitar.add(p);
        cambio = true;
      }
    }
  }
  return {
    seleccion: seleccion.filter((p) => !quitar.has(p)),
    arrastrados: seleccion.filter((p) => quitar.has(p) && p !== clave),
  };
}

// Lo que se gana y lo que se pierde entre dos listas (la vista previa).
export function diferencias(antes: readonly Permiso[], despues: readonly Permiso[]) {
  return {
    ganan: despues.filter((p) => !antes.includes(p)),
    pierden: antes.filter((p) => !despues.includes(p)),
  };
}
