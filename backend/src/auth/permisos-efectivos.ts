import { CATALOGO_PERMISOS, PERMISOS_PLATAFORMA, Permiso } from './permisos';

// Plan 19: reglas puras de los permisos (sin NestJS ni Prisma).

const ENTRADAS = new Map(CATALOGO_PERMISOS.map((e) => [e.clave as string, e]));

// R75: lo que una persona puede hacer = (permisos de su rol ∪ agregados) − quitados.
// Un permiso agregado y quitado a la vez queda quitado.
export function permisosEfectivos(
  delRol: readonly string[],
  agregados: readonly string[] = [],
  quitados: readonly string[] = [],
): Permiso[] {
  const quitar = new Set(quitados);
  return [...new Set([...delRol, ...agregados])].filter(
    (p): p is Permiso => ENTRADAS.has(p) && !quitar.has(p),
  );
}

// Una lista de permisos para un rol o un ajuste: claves del catálogo, sin
// repetir y, si se pide, con sus requisitos cumplidos. Devuelve los errores legibles.
export function validarPermisos(lista: readonly string[], conRequisitos = true): string[] {
  const errores: string[] = [];
  const vistos = new Set<string>();
  for (const clave of lista) {
    if (!ENTRADAS.has(clave)) errores.push(`"${clave}" no es un permiso del hotel`);
    else if (vistos.has(clave)) errores.push(`"${ENTRADAS.get(clave)!.etiqueta}" está repetido`);
    vistos.add(clave);
  }
  if (conRequisitos) {
    for (const clave of vistos) {
      const entrada = ENTRADAS.get(clave);
      for (const previo of entrada?.requiere ?? []) {
        if (!vistos.has(previo)) {
          errores.push(`"${entrada!.etiqueta}" necesita "${ENTRADAS.get(previo)!.etiqueta}"`);
        }
      }
    }
  }
  return errores;
}

// Los requisitos que le faltan a un conjunto de permisos efectivos (para
// validar el resultado de rol + ajustes de una persona).
export const requisitosFaltantes = (efectivos: readonly string[]) =>
  validarPermisos(efectivos).filter((e) => e.includes('necesita'));

// R76: nadie da lo que no tiene. Devuelve los permisos solicitados que el actor no tiene.
export function puedeOtorgar(delActor: readonly string[], solicitados: readonly string[]) {
  const tiene = new Set(delActor);
  return [...new Set(solicitados)].filter((p) => !tiene.has(p));
}

export const etiquetaPermiso = (clave: string) => ENTRADAS.get(clave)?.etiqueta ?? clave;

// Los permisos de un usuario tal como se lee de la base: el de la Consola
// tiene los suyos fijos; el de un hotel, los de su rol con sus ajustes.
export function permisosDeUsuario(usuario: {
  tipo: 'plataforma' | 'hotel';
  rol: { permisos: string[] } | null;
  permisosAgregados: string[];
  permisosQuitados: string[];
}): Permiso[] {
  if (usuario.tipo === 'plataforma') return [...PERMISOS_PLATAFORMA];
  return permisosEfectivos(
    usuario.rol?.permisos ?? [],
    usuario.permisosAgregados,
    usuario.permisosQuitados,
  );
}

// Lo que hay que leer de un usuario para saber qué puede hacer (Prisma select).
export const SELECCION_PERMISOS = {
  tipo: true,
  rol: { select: { id: true, nombre: true, permisos: true } },
  permisosAgregados: true,
  permisosQuitados: true,
} as const;
