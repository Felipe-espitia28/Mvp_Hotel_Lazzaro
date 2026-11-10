// Acciones del sistema que requieren autorización. Los endpoints piden
// permisos (no roles); plan 19: cada hotel arma sus roles con estos permisos
// (ver CATALOGO_PERMISOS) y puede ajustar los de cada persona.
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
  ROLES_GESTIONAR: 'roles:gestionar', // plan 19: crear y editar los roles del hotel
  HOTEL_CONFIGURAR: 'hotel:configurar', // marca, políticas, temporadas, catálogo
  PAGOS_ANULAR: 'pagos:anular', // A-1: corregir un pago registrado
  CUENTAS_POR_COBRAR: 'cuentas:por-cobrar', // A-1: cerrar con saldo y ver lo que se debe
  PANEL_GERENCIA: 'panel:gerencia', // B-1: indicadores del negocio (ocupación, ADR, RevPAR)
  AGENDA_GESTIONAR: 'agenda:gestionar', // S-2: citas del spa y cupos de las experiencias
  CAJA_TURNO: 'caja:turno', // B-3: abrir y cerrar el propio turno de caja
  CAJA_SUPERVISAR: 'caja:supervisar', // B-3: ver todos los turnos y los pagos sin turno
  PAGOS_EN_LINEA_CONFIGURAR: 'pagos:configurar', // B-2: conectar la cuenta de Wompi del hotel
  LIMPIEZA_GESTIONAR: 'limpieza:gestionar', // B-4: hacer las tareas de limpieza y reportar daños
  LIMPIEZA_ASIGNAR: 'limpieza:asignar', // B-4: ver todas las tareas, asignarlas y crearlas
  PLATAFORMA_GESTIONAR: 'plataforma:gestionar', // Consola Lazaro: hoteles y accesos
} as const;

export type Permiso = (typeof PERMISOS)[keyof typeof PERMISOS];

export const GRUPOS_PERMISOS = [
  'Habitaciones',
  'Reservas y estadías',
  'Folio y pagos',
  'Caja',
  'Servicios y agenda',
  'Limpieza',
  'Reportes',
  'Gerencia y equipo',
] as const;
export type GrupoPermisos = (typeof GRUPOS_PERMISOS)[number];

export interface EntradaCatalogo {
  clave: Permiso;
  grupo: GrupoPermisos;
  etiqueta: string;
  descripcion: string;
  // Dan poder sobre el dinero, el equipo o la configuración: la pantalla los marca.
  sensible: boolean;
  // Permisos sin los que este no sirve (la pantalla los marca juntos).
  requiere: Permiso[];
}

const P = PERMISOS;

// Plan 19: los permisos que un hotel puede dar (todos menos el de la Consola),
// explicados en lenguaje de hotel.
export const CATALOGO_PERMISOS: EntradaCatalogo[] = [
  {
    clave: P.HABITACIONES_VER,
    grupo: 'Habitaciones',
    etiqueta: 'Ver habitaciones',
    descripcion: 'Ver el tablero de habitaciones, su estado, las tarifas y la disponibilidad.',
    sensible: false,
    requiere: [],
  },
  {
    clave: P.HABITACIONES_ESTADO,
    grupo: 'Habitaciones',
    etiqueta: 'Cambiar el estado de las habitaciones',
    descripcion:
      'Marcar una habitación lista, sacarla de servicio y resolver los daños reportados.',
    sensible: false,
    requiere: [P.HABITACIONES_VER],
  },
  {
    clave: P.HABITACIONES_GESTIONAR,
    grupo: 'Habitaciones',
    etiqueta: 'Crear habitaciones y editar tarifas',
    descripcion:
      'Crear habitaciones (una a una, en rango o por archivo) y cambiar tipos y precios.',
    sensible: false,
    requiere: [P.HABITACIONES_VER],
  },
  {
    clave: P.RESERVAS_VER,
    grupo: 'Reservas y estadías',
    etiqueta: 'Ver reservas y huéspedes',
    descripcion: 'Ver el panel de hoy, el calendario, las reservas, los huéspedes y los folios.',
    sensible: false,
    requiere: [],
  },
  {
    clave: P.RESERVAS_GESTIONAR,
    grupo: 'Reservas y estadías',
    etiqueta: 'Crear, modificar y cancelar reservas',
    descripcion: 'Reservar, cambiar fechas o habitación, cancelar y asignar la empresa que paga.',
    sensible: false,
    requiere: [P.RESERVAS_VER],
  },
  {
    clave: P.ESTADIAS_GESTIONAR,
    grupo: 'Reservas y estadías',
    etiqueta: 'Hacer check-in y check-out',
    descripcion: 'Registrar la llegada (con el registro legal) y la salida, con su liquidación.',
    sensible: false,
    requiere: [P.RESERVAS_VER],
  },
  {
    clave: P.NO_SHOWS_PROCESAR,
    grupo: 'Reservas y estadías',
    etiqueta: 'Procesar no-shows',
    descripcion: 'Marcar como no-show las reservas cuyo huésped no llegó (también corre solo).',
    sensible: false,
    requiere: [P.RESERVAS_VER],
  },
  {
    clave: P.FOLIO_GESTIONAR,
    grupo: 'Folio y pagos',
    etiqueta: 'Cargar consumos y registrar pagos',
    descripcion: 'Cargar y anular consumos, registrar abonos y anticipos, y generar links de pago.',
    sensible: false,
    requiere: [P.RESERVAS_VER],
  },
  {
    clave: P.PAGOS_ANULAR,
    grupo: 'Folio y pagos',
    etiqueta: 'Anular pagos registrados',
    descripcion: 'Corregir un pago mal digitado; la anulación queda en la auditoría.',
    sensible: true,
    requiere: [P.FOLIO_GESTIONAR],
  },
  {
    clave: P.CUENTAS_POR_COBRAR,
    grupo: 'Folio y pagos',
    etiqueta: 'Cuentas por cobrar',
    descripcion: 'Cerrar una estadía con saldo pendiente y ver lo que deben huéspedes y empresas.',
    sensible: true,
    requiere: [P.FOLIO_GESTIONAR],
  },
  {
    clave: P.CAJA_TURNO,
    grupo: 'Caja',
    etiqueta: 'Abrir y cerrar su turno de caja',
    descripcion: 'Su propio turno: la base, los pagos que registra y el cuadre al cerrar.',
    sensible: false,
    requiere: [],
  },
  {
    clave: P.CAJA_SUPERVISAR,
    grupo: 'Caja',
    etiqueta: 'Supervisar la caja',
    descripcion: 'Ver los turnos de todos, cerrar el de otro y ver los pagos hechos sin turno.',
    sensible: true,
    requiere: [P.CAJA_TURNO],
  },
  {
    clave: P.AGENDA_GESTIONAR,
    grupo: 'Servicios y agenda',
    etiqueta: 'Agendar servicios',
    descripcion: 'Citas del spa y cupos de las experiencias, y su cobro.',
    sensible: false,
    requiere: [],
  },
  {
    clave: P.LIMPIEZA_GESTIONAR,
    grupo: 'Limpieza',
    etiqueta: 'Hacer tareas de limpieza',
    descripcion: 'Ver sus habitaciones del día, iniciarlas y terminarlas, y reportar daños.',
    sensible: false,
    requiere: [P.HABITACIONES_VER],
  },
  {
    clave: P.LIMPIEZA_ASIGNAR,
    grupo: 'Limpieza',
    etiqueta: 'Asignar la limpieza',
    descripcion: 'Ver todas las tareas del día, asignarlas al personal y crear tareas a mano.',
    sensible: false,
    requiere: [P.LIMPIEZA_GESTIONAR],
  },
  {
    clave: P.REPORTES_LEGALES,
    grupo: 'Reportes',
    etiqueta: 'Reportes legales (TRA y SIRE)',
    descripcion: 'Descargar los reportes de huéspedes para MinCIT y Migración Colombia.',
    sensible: false,
    requiere: [P.RESERVAS_VER],
  },
  {
    clave: P.PANEL_GERENCIA,
    grupo: 'Reportes',
    etiqueta: 'Indicadores del negocio',
    descripcion: 'Ocupación, ADR, RevPAR, pronóstico e ingresos en la pestaña Gerencia del panel.',
    sensible: false,
    requiere: [P.RESERVAS_VER],
  },
  {
    clave: P.HOTEL_CONFIGURAR,
    grupo: 'Gerencia y equipo',
    etiqueta: 'Configurar el hotel',
    descripcion: 'Marca, políticas, temporadas, catálogo de servicios y empresas.',
    sensible: true,
    requiere: [],
  },
  {
    clave: P.PAGOS_EN_LINEA_CONFIGURAR,
    grupo: 'Gerencia y equipo',
    etiqueta: 'Conectar la pasarela de pagos',
    descripcion: 'Guardar las llaves de Wompi del hotel y probar la conexión.',
    sensible: true,
    requiere: [P.HOTEL_CONFIGURAR],
  },
  {
    clave: P.USUARIOS_GESTIONAR,
    grupo: 'Gerencia y equipo',
    etiqueta: 'Gestionar el equipo',
    descripcion: 'Crear personas, asignarles un rol, ajustar sus permisos y desactivarlas.',
    sensible: true,
    requiere: [],
  },
  {
    clave: P.ROLES_GESTIONAR,
    grupo: 'Gerencia y equipo',
    etiqueta: 'Gestionar los roles',
    descripcion: 'Crear, editar y eliminar los roles del hotel y elegir sus permisos.',
    sensible: true,
    requiere: [P.USUARIOS_GESTIONAR],
  },
];

export const PERMISOS_DE_HOTEL: Permiso[] = CATALOGO_PERMISOS.map((e) => e.clave);

// Lo de todos los días en recepción (la plantilla "Recepción").
const OPERACION_DIARIA: Permiso[] = [
  P.HABITACIONES_VER,
  P.HABITACIONES_ESTADO,
  P.RESERVAS_VER,
  P.RESERVAS_GESTIONAR,
  P.ESTADIAS_GESTIONAR,
  P.FOLIO_GESTIONAR,
  P.NO_SHOWS_PROCESAR,
  P.REPORTES_LEGALES,
  P.AGENDA_GESTIONAR,
  P.CAJA_TURNO,
  P.LIMPIEZA_GESTIONAR,
  P.LIMPIEZA_ASIGNAR,
];

// Plan 19: los roles con que nace cada hotel (y los que conservan los usuarios
// de antes: la migración los convierte uno a uno). Después el hotel los edita.
export const PLANTILLAS_DE_ROL = {
  Administrador: {
    descripcion: 'Maneja la Gerencia del hotel: configuración, equipo, roles y dinero.',
    permisos: PERMISOS_DE_HOTEL,
  },
  Recepción: {
    descripcion: 'Opera el día a día: reservas, check-in y check-out, folio y caja.',
    permisos: OPERACION_DIARIA,
  },
  Camarera: {
    descripcion: 'Ve las habitaciones y hace sus tareas de limpieza.',
    permisos: [P.HABITACIONES_VER, P.LIMPIEZA_GESTIONAR],
  },
} satisfies Record<string, { descripcion: string; permisos: Permiso[] }>;
export type NombrePlantilla = keyof typeof PLANTILLAS_DE_ROL;
export const NOMBRES_PLANTILLAS = Object.keys(PLANTILLAS_DE_ROL) as NombrePlantilla[];

// El equipo de Lazaro (Consola) no pertenece a ningún hotel: permisos fijos.
export const PERMISOS_PLATAFORMA: Permiso[] = [P.PLATAFORMA_GESTIONAR];

export function tienePermiso(quien: { permisos: readonly Permiso[] }, permiso: Permiso) {
  return quien.permisos.includes(permiso);
}
