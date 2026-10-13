import { RolUsuario } from '@prisma/client';

// Acciones del sistema que requieren autorización. Los endpoints piden
// permisos (no roles), así que cambiar qué puede hacer un rol es editar la
// tabla de abajo, sin tocar los controladores.
export const PERMISOS = {
  HABITACIONES_VER: 'habitaciones:ver',
  HABITACIONES_GESTIONAR: 'habitaciones:gestionar',
  HABITACIONES_ESTADO: 'habitaciones:estado', // marcar lista, fuera de servicio
  RESERVAS_VER: 'reservas:ver',
  RESERVAS_GESTIONAR: 'reservas:gestionar', // crear y cancelar
  ESTADIAS_GESTIONAR: 'estadias:gestionar', // check-in y check-out
  FOLIO_GESTIONAR: 'folio:gestionar', // cargar y anular consumos
  NO_SHOWS_PROCESAR: 'no-shows:procesar',
  USUARIOS_GESTIONAR: 'usuarios:gestionar',
} as const;

export type Permiso = (typeof PERMISOS)[keyof typeof PERMISOS];

const OPERACION_DIARIA: Permiso[] = [
  PERMISOS.HABITACIONES_VER,
  PERMISOS.HABITACIONES_ESTADO,
  PERMISOS.RESERVAS_VER,
  PERMISOS.RESERVAS_GESTIONAR,
  PERMISOS.ESTADIAS_GESTIONAR,
  PERMISOS.FOLIO_GESTIONAR,
  PERMISOS.NO_SHOWS_PROCESAR,
];

// Recepción opera el día a día; el administrador además configura el hotel
// (habitaciones) y gestiona quién usa el sistema.
export const PERMISOS_POR_ROL: Record<RolUsuario, Permiso[]> = {
  recepcionista: OPERACION_DIARIA,
  admin: [...OPERACION_DIARIA, PERMISOS.HABITACIONES_GESTIONAR, PERMISOS.USUARIOS_GESTIONAR],
};

export function tienePermiso(rol: RolUsuario, permiso: Permiso) {
  return PERMISOS_POR_ROL[rol].includes(permiso);
}
