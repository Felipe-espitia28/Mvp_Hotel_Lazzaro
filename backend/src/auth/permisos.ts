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
  REPORTES_LEGALES: 'reportes-legales:ver', // TRA y SIRE (A-6)
  USUARIOS_GESTIONAR: 'usuarios:gestionar',
  HOTEL_CONFIGURAR: 'hotel:configurar', // marca, políticas, temporadas, catálogo
  PAGOS_ANULAR: 'pagos:anular', // A-1: corregir un pago registrado
  CUENTAS_POR_COBRAR: 'cuentas:por-cobrar', // A-1: cerrar con saldo y ver lo que se debe
  PANEL_GERENCIA: 'panel:gerencia', // B-1: indicadores del negocio (ocupación, ADR, RevPAR)
  AGENDA_GESTIONAR: 'agenda:gestionar', // S-2: citas del spa y cupos de las experiencias
  CAJA_TURNO: 'caja:turno', // B-3: abrir y cerrar el propio turno de caja
  CAJA_SUPERVISAR: 'caja:supervisar', // B-3: ver todos los turnos y los pagos sin turno
  PAGOS_EN_LINEA_CONFIGURAR: 'pagos:configurar', // B-2: conectar la cuenta de Wompi del hotel
  PLATAFORMA_GESTIONAR: 'plataforma:gestionar', // Consola Lazaro: hoteles y accesos
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
  PERMISOS.REPORTES_LEGALES,
  PERMISOS.AGENDA_GESTIONAR,
  PERMISOS.CAJA_TURNO,
];

// Recepción opera el día a día; el administrador además maneja la Gerencia de
// su hotel (personalización, habitaciones y equipo). El rol plataforma (equipo
// de Lazaro) solo usa la Consola: crea hoteles y da accesos, pero no opera las
// reservas de ningún hotel.
export const PERMISOS_POR_ROL: Record<RolUsuario, Permiso[]> = {
  recepcionista: OPERACION_DIARIA,
  admin: [
    ...OPERACION_DIARIA,
    PERMISOS.HABITACIONES_GESTIONAR,
    PERMISOS.USUARIOS_GESTIONAR,
    PERMISOS.HOTEL_CONFIGURAR,
    PERMISOS.PAGOS_ANULAR,
    PERMISOS.CUENTAS_POR_COBRAR,
    PERMISOS.PANEL_GERENCIA,
    PERMISOS.CAJA_SUPERVISAR,
    PERMISOS.PAGOS_EN_LINEA_CONFIGURAR,
  ],
  plataforma: [PERMISOS.PLATAFORMA_GESTIONAR],
};

export function tienePermiso(rol: RolUsuario, permiso: Permiso) {
  return PERMISOS_POR_ROL[rol].includes(permiso);
}
