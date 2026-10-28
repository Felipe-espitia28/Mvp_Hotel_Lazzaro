import type {
  Calendario,
  CategoriaCargo,
  EstadoReserva,
  FilaRegistroHotelero,
  RegistroCheckIn,
  Folio,
  MedioPago,
  CalendarioTemporadas,
  HabitacionDisponible,
  TipoHabitacion,
  EventoReserva,
  PanelHoy,
  AgendaDelDia,
  CitaServicio,
  CupoExperiencia,
  EstadoCita,
  HuecosDeRecurso,
  QuienToma,
  RecursoServicio,
  SalidaExperiencia,
  PagoSinTurno,
  Empresa,
  EstadoCuentaEmpresa,
  NuevaEmpresa,
  ReglaEmpresa,
  Responsable,
  RolUsuario,
  Incidencia,
  PrioridadIncidencia,
  TareaLimpieza,
  TareasDelDia,
  TipoTareaLimpieza,
  EstadoPasarela,
  IntentoPago,
  LlavesWompi,
  PagoPublico,
  Turno,
  PanelGerencia,
  Pickup,
  Pronostico,
  Habitacion,
  AvisosLote,
  InformeImportacion,
  HuespedDetalle,
  HuespedResumen,
  Hotel,
  HotelResumen,
  MarcaHotel,
  CuentaPorCobrar,
  FilaSire,
  FilaTra,
  Municipio,
  PendienteLegal,
  PoliticaDatos,
  PoliticasHotel,
  ProblemaRegistro,
  Reserva,
  Desglose,
  CategoriaServicio,
  DefinicionAtributo,
  Disponibilidad,
  ModoPrecio,
  Servicio,
  TipoAtributo,
  TipoServicio,
  ValorAtributo,
  TemporadaHotel,
  RolDeHotel,
  Sesion,
  TipoDocumento,
  Usuario,
  UsuarioSesion,
} from './types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

// Error tipado para poder distinguir un 409 (solapamiento) del resto de errores.
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    // Problemas por campo que manda el check-in (R43), para marcarlos en el formulario.
    public readonly problemas: ProblemaRegistro[] = [],
    // El cuerpo completo de la respuesta (p. ej. el informe de una importación rechazada).
    public readonly cuerpo: unknown = null,
  ) {
    super(message);
  }
}

// La sesión se guarda en el navegador para sobrevivir a una recarga de página.
// (En un MVP es suficiente; en producción conviene una cookie httpOnly.)
const CLAVE_SESION = 'mvp-hotel-sesion';

export function leerSesion(): Sesion | null {
  try {
    const guardada = localStorage.getItem(CLAVE_SESION);
    return guardada ? (JSON.parse(guardada) as Sesion) : null;
  } catch {
    return null;
  }
}

export function guardarSesion(sesion: Sesion | null) {
  try {
    if (sesion) localStorage.setItem(CLAVE_SESION, JSON.stringify(sesion));
    else localStorage.removeItem(CLAVE_SESION);
  } catch {
    // Sin almacenamiento disponible: la sesión dura lo que dure la pestaña.
  }
}

// Evento que avisa a la app que el backend rechazó la sesión (vencida o usuario desactivado).
export const EVENTO_SESION_VENCIDA = 'sesion-vencida';

let tokenActual: string | null = leerSesion()?.token ?? null;

export function usarToken(token: string | null) {
  tokenActual = token;
}

// Todas las llamadas pasan por aquí: agrega el token y traduce los errores.
async function solicitar<T>(ruta: string, opciones: { metodo?: string; cuerpo?: unknown } = {}) {
  const cabeceras: Record<string, string> = {};
  if (opciones.cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';
  if (tokenActual) cabeceras.Authorization = `Bearer ${tokenActual}`;

  const respuesta = await fetch(`${API_URL}${ruta}`, {
    method: opciones.metodo ?? 'GET',
    headers: cabeceras,
    body: opciones.cuerpo !== undefined ? JSON.stringify(opciones.cuerpo) : undefined,
  });

  if (!respuesta.ok) {
    const cuerpo = await respuesta.json().catch(() => null);
    const mensaje = Array.isArray(cuerpo?.message)
      ? cuerpo.message.join('. ')
      : (cuerpo?.message ?? `Error HTTP ${respuesta.status}`);
    if (respuesta.status === 401 && tokenActual) {
      window.dispatchEvent(new CustomEvent(EVENTO_SESION_VENCIDA, { detail: mensaje }));
    }
    throw new ApiError(
      mensaje,
      respuesta.status,
      Array.isArray(cuerpo?.problemas) ? cuerpo.problemas : [],
      cuerpo,
    );
  }
  return (respuesta.status === 204 ? undefined : await respuesta.json()) as T;
}

// Descarga un archivo del backend (con la sesión) y lo guarda en el equipo.
async function descargar(ruta: string, nombreArchivo: string) {
  const respuesta = await fetch(`${API_URL}${ruta}`, {
    headers: tokenActual ? { Authorization: `Bearer ${tokenActual}` } : {},
  });
  if (!respuesta.ok) {
    const cuerpo = await respuesta.json().catch(() => null);
    throw new ApiError(cuerpo?.message ?? `Error HTTP ${respuesta.status}`, respuesta.status);
  }
  const url = URL.createObjectURL(await respuesta.blob());
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  enlace.click();
  URL.revokeObjectURL(url);
}

let municipiosEnMemoria: Promise<Municipio[]> | undefined;

// A-1 / A-2: un anticipo, un abono o un reembolso del folio.
export interface NuevoPago {
  tipo?: 'abono' | 'anticipo' | 'reembolso';
  medio: MedioPago;
  monto: number;
  referencia?: string;
  // B-5: a qué subcuenta abona (por defecto, la del huésped).
  responsable?: Responsable;
}

export interface CheckOut {
  pagos: NuevoPago[];
  cerrarConSaldo?: boolean;
  saldoAFavor?: boolean;
}

export interface NuevaHabitacion {
  numero: string;
  tipoHabitacionId: string;
}

// A-4: "101" a "120" de una vez; sin piso, se infiere de cada número.
export interface RangoHabitaciones {
  desde: string;
  hasta: string;
  tipoId: string;
  piso?: number;
  prefijo?: string;
}

export type DatosTipoHabitacion = Omit<
  TipoHabitacion,
  'id' | '_count' | 'tarifaBase' | 'cargoPersonaAdicional' | 'cargoNinoAdicional'
> & {
  tarifaBase: number;
  cargoPersonaAdicional: number;
  cargoNinoAdicional: number;
};

export interface NuevaReserva {
  habitacionId: string;
  huesped: {
    nombre: string;
    tipoDocumento: TipoDocumento;
    documento: string;
    telefono?: string;
    email?: string;
  };
  adultos: number;
  // A-3: edad de cada niño a la fecha de entrada.
  edadesNinos: number[];
  fechaEntrada: string;
  fechaSalida: string;
  // B-5: la empresa que paga y qué paga.
  empresaId?: string;
  reglaEmpresa?: ReglaEmpresa;
}

export interface FiltrosReservas {
  estado?: EstadoReserva;
  buscar?: string;
  pagina?: number;
  porPagina?: number;
}

// Respuesta paginada del backend.
export interface Pagina<T> {
  datos: T[];
  total: number;
  pagina: number;
  porPagina: number;
  paginas: number;
}

// Un consumo sale del catálogo (servicioId) o se carga con valor libre. Del
// catálogo: cantidad (fijo), personas (por persona) o adultos y edades (por edad).
export type NuevoCargo =
  | { servicioId: string; cantidad?: number; adultos?: number; edadesNinos?: number[] }
  | { categoria: CategoriaCargo; concepto: string; cantidad: number; valorUnitario: number };

// A-5: lo que cambia de una reserva (lo que no viene se conserva).
export interface CambiosReserva {
  fechaEntrada?: string;
  fechaSalida?: string;
  habitacionId?: string;
  adultos?: number;
  edadesNinos?: number[];
  motivo?: 'decision_hotel';
  mantenerTarifaPorNoche?: boolean;
}

export interface CotizacionModificacion {
  desglose: Desglose;
  totalAnterior: number;
  total: number;
  diferencia: number;
  penalidad: number;
  // Positivo = debe; negativo = a favor del huésped.
  saldo: number;
}

export interface DatosCategoria {
  nombre: string;
  clasificacion: CategoriaCargo;
  icono?: string | null;
}

export interface DatosAtributo {
  etiqueta: string;
  tipo: TipoAtributo;
  opciones?: string[];
  obligatorio?: boolean;
}

// Al crear y al editar un servicio (null vacía un campo opcional).
export interface DatosServicio {
  codigo?: string;
  nombre?: string;
  descripcion?: string | null;
  categoriaId?: string;
  tipo?: TipoServicio;
  modoPrecio?: ModoPrecio;
  precio?: number;
  precioNino?: number | null;
  duracionMinutos?: number | null;
  cuposPorSalida?: number | null;
  disponibilidad?: Disponibilidad | null;
  atributos?: Record<string, ValorAtributo>;
  visibleRecepcion?: boolean;
  activo?: boolean;
}

export interface FiltroServicios {
  categoriaId?: string;
  tipo?: TipoServicio;
  activo?: boolean;
  buscar?: string;
}

export interface NuevoUsuario {
  nombre: string;
  email: string;
  contrasena: string;
  rol: RolDeHotel;
}

export interface DatosHotel {
  nombre?: string;
  ciudad?: string;
  nit?: string;
  telefono?: string;
  tipoAlojamiento?: string;
}

// Alta de un hotel desde la Consola Lazaro.
export interface NuevoHotel extends DatosHotel {
  nombre: string;
  slug: string;
  eslogan?: string;
  colorPrimario?: string;
  colorAcento?: string;
  fuenteTitulos?: string;
  fuenteTexto?: string;
  personas: NuevoUsuario[];
}

// Gestión del personal de un hotel. La usan la Gerencia (su propio hotel) y
// la Consola Lazaro (cualquier hotel), con las mismas pantallas.
export interface GestionEquipo {
  listar: () => Promise<Usuario[]>;
  crear: (datos: NuevoUsuario) => Promise<Usuario>;
  actualizar: (id: string, cambios: { rol?: RolDeHotel; activo?: boolean }) => Promise<Usuario>;
  restablecer: (id: string, nueva: string) => Promise<void>;
}

const post = <T>(ruta: string, cuerpo?: unknown) => solicitar<T>(ruta, { metodo: 'POST', cuerpo });

export const api = {
  login: (email: string, contrasena: string) =>
    post<{ token: string; usuario: UsuarioSesion }>('/auth/login', { email, contrasena }),

  // Perfil y permisos vigentes de quien tiene la sesión abierta.
  yo: () => solicitar<UsuarioSesion>('/auth/yo'),

  cambiarContrasena: (actual: string, nueva: string) =>
    post<void>('/auth/cambiar-contrasena', { actual, nueva }),

  panelHoy: () => solicitar<PanelHoy>('/panel/hoy'),

  // B-1: indicadores del negocio (solo admin). desde y hasta: YYYY-MM-DD, incluidos.
  panelGerencia: (desde: string, hasta: string) =>
    solicitar<PanelGerencia>(`/panel/gerencia?desde=${desde}&hasta=${hasta}`),

  pronostico: (dias: 7 | 30 = 30) => solicitar<Pronostico>(`/panel/pronostico?dias=${dias}`),

  pickup: (dias = 7) => solicitar<Pickup>(`/panel/pickup?dias=${dias}`),

  // desde: YYYY-MM-DD (por defecto, hoy en el hotel).
  calendario: (desde?: string, dias = 14) =>
    solicitar<Calendario>(`/panel/calendario?dias=${dias}${desde ? `&desde=${desde}` : ''}`),

  listarHabitaciones: () => solicitar<Habitacion[]>('/habitaciones'),

  crearHabitacion: (datos: NuevaHabitacion) => post<Habitacion>('/habitaciones', datos),

  disponibles: (desde: string, hasta: string, adultos = 1, edadesNinos: number[] = []) =>
    solicitar<HabitacionDisponible[]>(
      `/habitaciones/disponibles?desde=${desde}&hasta=${hasta}&adultos=${adultos}&edadesNinos=${edadesNinos.join(',')}`,
    ),

  // Marcar lista ("libre") o sacar de servicio ("fuera_servicio").
  cambiarEstadoHabitacion: (id: string, estado: 'libre' | 'fuera_servicio') =>
    solicitar<Habitacion & { reservasAfectadas: number }>(`/habitaciones/${id}/estado`, {
      metodo: 'PATCH',
      cuerpo: { estado },
    }),

  // A-4: alta masiva y cambios en lote (todo o nada, R52).
  crearRangoHabitaciones: (datos: RangoHabitaciones) =>
    post<{ creadas: number; numeros: string[] }>('/habitaciones/rango', datos),
  validarImportacionHabitaciones: (filas: Record<string, unknown>[]) =>
    post<InformeImportacion>('/habitaciones/importar?soloValidar=true', { filas }),
  importarHabitaciones: (filas: Record<string, unknown>[]) =>
    post<InformeImportacion & { avisos: AvisosLote }>('/habitaciones/importar', { filas }),
  cambiarEstadoEnLote: (ids: string[], estado: 'libre' | 'fuera_servicio') =>
    post<{ actualizadas: number; avisos: AvisosLote }>('/habitaciones/lote/estado', {
      ids,
      estado,
    }),
  cambiarTipoEnLote: (ids: string[], tipoId: string) =>
    post<{ actualizadas: number; avisos: AvisosLote }>('/habitaciones/lote/tipo', { ids, tipoId }),
  descargarPlantillaHabitaciones: () =>
    descargar('/habitaciones/plantilla', 'plantilla-habitaciones.csv'),

  tiposHabitacion: () => solicitar<TipoHabitacion[]>('/tipos-habitacion'),

  crearTipoHabitacion: (datos: DatosTipoHabitacion) =>
    post<TipoHabitacion>('/tipos-habitacion', datos),

  actualizarTipoHabitacion: (id: string, cambios: Partial<DatosTipoHabitacion>) =>
    solicitar<TipoHabitacion>(`/tipos-habitacion/${id}`, { metodo: 'PATCH', cuerpo: cambios }),

  temporadas: (anio?: number) =>
    solicitar<CalendarioTemporadas>(`/tarifas/temporadas${anio ? `?anio=${anio}` : ''}`),

  listarReservas: (filtros: FiltrosReservas = {}) => {
    const query = new URLSearchParams();
    for (const [clave, valor] of Object.entries(filtros)) {
      if (valor !== undefined && valor !== '') query.set(clave, String(valor));
    }
    return solicitar<Pagina<Reserva>>(`/reservas?${query}`);
  },

  crearReserva: (datos: NuevaReserva) => post<Reserva>('/reservas', datos),

  // A-3: `avisos` dice si las edades registradas no son las declaradas.
  checkIn: (id: string, registro: RegistroCheckIn) =>
    post<Reserva & { avisos: string[] }>(`/reservas/${id}/check-in`, registro),

  // R19: registro hotelero de un día de llegada (YYYY-MM-DD; por defecto hoy).
  registroHotelero: (fecha?: string) =>
    solicitar<{ fecha: string; registros: FilaRegistroHotelero[] }>(
      `/reservas/registro-hotelero${fecha ? `?fecha=${fecha}` : ''}`,
    ),

  // A-1: los pagos finales deben dejar el saldo en 0 (salvo las excepciones).
  checkOut: (id: string, cuerpo: CheckOut) =>
    post<Reserva & { saldo: number }>(`/reservas/${id}/check-out`, cuerpo),

  registrarPago: (id: string, pago: NuevoPago) => post<Folio>(`/reservas/${id}/pagos`, pago),
  // B-5: pasar un cargo entre la cuenta del huésped y la de la empresa.
  moverCargo: (id: string, cargoId: string, responsable: Responsable) =>
    post<Folio>(`/reservas/${id}/cargos/${cargoId}/mover`, { responsable }),
  asignarEmpresa: (id: string, empresaId: string | null, reglaEmpresa?: ReglaEmpresa) =>
    solicitar<Folio>(`/reservas/${id}/empresa`, {
      metodo: 'PATCH',
      cuerpo: { empresaId, reglaEmpresa },
    }),
  anularPago: (id: string, pagoId: string, motivo: string) =>
    post<Folio>(`/reservas/${id}/pagos/${pagoId}/anular`, { motivo }),
  cuentasPorCobrar: () => solicitar<CuentaPorCobrar[]>('/cuentas-por-cobrar'),
  saldosAFavor: () => solicitar<CuentaPorCobrar[]>('/saldos-a-favor'),

  folio: (id: string) => solicitar<Folio>(`/reservas/${id}/folio`),

  agregarCargo: (id: string, cargo: NuevoCargo) => post<Folio>(`/reservas/${id}/cargos`, cargo),

  anularCargo: (id: string, cargoId: string, motivo: string) =>
    post<Folio>(`/reservas/${id}/cargos/${cargoId}/anular`, { motivo }),

  // A-2: el anticipo se aplica a la penalidad; aDevolver es lo que sobra.
  // A-5 (R7): modificar sin cancelar; cotizar no guarda nada.
  cotizarModificacion: (id: string, cambios: CambiosReserva) =>
    post<CotizacionModificacion>(`/reservas/${id}/cotizar-modificacion`, cambios),
  modificarReserva: (id: string, cambios: CambiosReserva) =>
    solicitar<
      Reserva & { diferencia: number; penalidad: number; saldo: number; saldoAFavor: number }
    >(`/reservas/${id}`, { metodo: 'PATCH', cuerpo: cambios }),

  cancelar: (id: string) =>
    post<Reserva & { penalidad: number; anticipos: number; aDevolver: number }>(
      `/reservas/${id}/cancelar`,
    ),

  historialReserva: (id: string) => solicitar<EventoReserva[]>(`/reservas/${id}/historial`),

  procesarNoShows: () => post<{ marcadas: string[] }>('/reservas/no-shows/procesar'),

  buscarHuespedes: (texto: string) =>
    solicitar<HuespedResumen[]>(`/huespedes?buscar=${encodeURIComponent(texto)}`),

  // Devuelve null si el documento no está registrado (cliente nuevo).
  huespedPorDocumento: async (tipo: TipoDocumento, documento: string) => {
    try {
      return await solicitar<HuespedResumen>(
        `/huespedes/documento/${tipo}/${encodeURIComponent(documento)}`,
      );
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  },

  detalleHuesped: (id: string) => solicitar<HuespedDetalle>(`/huespedes/${id}`),

  // A-6: municipios de la DIVIPOLA (se piden una sola vez por sesión).
  municipios: () => (municipiosEnMemoria ??= solicitar<Municipio[]>('/huespedes/municipios')),

  // A-6: reportes legales de un rango de llegadas (YYYY-MM-DD).
  reporteTra: (desde: string, hasta: string) =>
    solicitar<FilaTra[]>(`/reportes-legales/tra?desde=${desde}&hasta=${hasta}`),
  reporteSire: (desde: string, hasta: string) =>
    solicitar<FilaSire[]>(`/reportes-legales/sire?desde=${desde}&hasta=${hasta}`),
  pendientesLegales: (desde: string, hasta: string) =>
    solicitar<PendienteLegal[]>(`/reportes-legales/pendientes?desde=${desde}&hasta=${hasta}`),
  descargarReporte: (reporte: 'tra' | 'sire', desde: string, hasta: string) =>
    descargar(
      `/reportes-legales/${reporte}?desde=${desde}&hasta=${hasta}&formato=csv`,
      `${reporte}-${desde}-${hasta}.csv`,
    ),

  // Marca pública de un hotel, para su pantalla de ingreso (sin sesión).
  marcaPublica: (slug: string) =>
    solicitar<MarcaHotel>(`/publico/hoteles/${encodeURIComponent(slug)}/marca`),

  // Gerencia del hotel: el hotel del usuario (marca, datos y políticas).
  hotel: () => solicitar<Hotel>('/hotel'),

  actualizarMarca: (cambios: Partial<Omit<MarcaHotel, 'slug' | 'nombre'>>) =>
    solicitar<Hotel>('/hotel/marca', { metodo: 'PATCH', cuerpo: cambios }),

  actualizarDatosHotel: (datos: DatosHotel) =>
    solicitar<Hotel>('/hotel', { metodo: 'PATCH', cuerpo: datos }),

  // R45: política de tratamiento de datos vigente; publicar crea una versión nueva.
  politicaDatos: () => solicitar<PoliticaDatos>('/hotel/politica-datos'),
  publicarPoliticaDatos: (texto: string) => post<PoliticaDatos>('/hotel/politica-datos', { texto }),

  // Temporadas propias del hotel.
  temporadasHotel: () => solicitar<TemporadaHotel[]>('/temporadas'),
  crearTemporada: (datos: Omit<TemporadaHotel, 'id' | 'activa'>) =>
    post<TemporadaHotel>('/temporadas', datos),
  actualizarTemporada: (id: string, cambios: Partial<Omit<TemporadaHotel, 'id'>>) =>
    solicitar<TemporadaHotel>(`/temporadas/${id}`, { metodo: 'PATCH', cuerpo: cambios }),
  eliminarTemporada: (id: string) => solicitar<void>(`/temporadas/${id}`, { metodo: 'DELETE' }),

  // S-1: catálogo de servicios del hotel (categorías, atributos y servicios).
  categoriasServicio: () => solicitar<CategoriaServicio[]>('/servicios/categorias'),
  crearCategoriaServicio: (datos: DatosCategoria) =>
    post<CategoriaServicio>('/servicios/categorias', datos),
  actualizarCategoriaServicio: (
    id: string,
    cambios: Partial<DatosCategoria> & { activa?: boolean },
  ) =>
    solicitar<CategoriaServicio>(`/servicios/categorias/${id}`, {
      metodo: 'PATCH',
      cuerpo: cambios,
    }),
  ordenarCategoriasServicio: (ids: string[]) =>
    solicitar<CategoriaServicio[]>('/servicios/categorias/orden', {
      metodo: 'PATCH',
      cuerpo: { ids },
    }),
  crearAtributo: (categoriaId: string, datos: DatosAtributo) =>
    post<DefinicionAtributo>(`/servicios/categorias/${categoriaId}/atributos`, datos),
  actualizarAtributo: (
    categoriaId: string,
    atributoId: string,
    cambios: Partial<Omit<DatosAtributo, 'tipo'>>,
  ) =>
    solicitar<DefinicionAtributo>(`/servicios/categorias/${categoriaId}/atributos/${atributoId}`, {
      metodo: 'PATCH',
      cuerpo: cambios,
    }),
  servicios: (filtro: FiltroServicios = {}) => {
    const consulta = new URLSearchParams(
      Object.entries(filtro).flatMap(([clave, valor]) =>
        valor === undefined || valor === '' ? [] : [[clave, String(valor)]],
      ),
    ).toString();
    return solicitar<Servicio[]>(`/servicios${consulta ? `?${consulta}` : ''}`);
  },
  servicio: (id: string) => solicitar<Servicio>(`/servicios/${id}`),
  // Plan 09: carga masiva por categoría (plantilla con sus atributos propios).
  descargarPlantillaServicios: (categoriaId: string) =>
    descargar(`/servicios/categorias/${categoriaId}/plantilla`, 'plantilla-servicios.csv'),
  validarImportacionServicios: (categoriaId: string, filas: Record<string, unknown>[]) =>
    post<InformeImportacion>(`/servicios/categorias/${categoriaId}/importar?soloValidar=true`, {
      filas,
    }),
  importarServicios: (categoriaId: string, filas: Record<string, unknown>[]) =>
    post<InformeImportacion>(`/servicios/categorias/${categoriaId}/importar`, { filas }),
  crearServicio: (datos: DatosServicio) => post<Servicio>('/servicios', datos),
  actualizarServicio: (id: string, cambios: DatosServicio) =>
    solicitar<Servicio>(`/servicios/${id}`, { metodo: 'PATCH', cuerpo: cambios }),
  agregarFotoServicio: (id: string, foto: string) =>
    post<Servicio>(`/servicios/${id}/fotos`, { foto }),
  quitarFotoServicio: (id: string, indice: number) =>
    solicitar<Servicio>(`/servicios/${id}/fotos/${indice}`, { metodo: 'DELETE' }),

  // S-2: agenda de servicios.
  agenda: {
    delDia: (fecha: string) => solicitar<AgendaDelDia>(`/agenda?fecha=${fecha}`),
    disponibilidad: (servicioId: string, fecha: string) =>
      solicitar<HuecosDeRecurso[]>(
        `/agenda/disponibilidad?servicioId=${servicioId}&fecha=${fecha}`,
      ),
    deReserva: (reservaId: string) =>
      solicitar<{
        citas: CitaServicio[];
        cupos: (CupoExperiencia & { salida: { inicio: string; servicio: { nombre: string } } })[];
      }>(`/agenda/reservas/${reservaId}`),
    recursos: () => solicitar<RecursoServicio[]>('/agenda/recursos'),
    crearRecurso: (datos: { nombre: string; servicioIds: string[] }) =>
      post<RecursoServicio>('/agenda/recursos', datos),
    actualizarRecurso: (
      id: string,
      cambios: Partial<{ nombre: string; servicioIds: string[]; activo: boolean }>,
    ) => solicitar<RecursoServicio>(`/agenda/recursos/${id}`, { metodo: 'PATCH', cuerpo: cambios }),
    agendar: (datos: QuienToma & { servicioId: string; recursoId: string; inicio: string }) =>
      post<CitaServicio>('/citas', datos),
    cambiarEstado: (
      id: string,
      estado: Exclude<EstadoCita, 'agendada'>,
      pago?: QuienToma['pago'],
    ) =>
      solicitar<CitaServicio>(`/citas/${id}/estado`, { metodo: 'PATCH', cuerpo: { estado, pago } }),
    salidas: (desde?: string, hasta?: string) => {
      const query = new URLSearchParams();
      if (desde) query.set('desde', desde);
      if (hasta) query.set('hasta', hasta);
      return solicitar<SalidaExperiencia[]>(`/salidas?${query}`);
    },
    crearSalidas: (datos: {
      servicioId: string;
      inicio: string;
      cupos?: number;
      repetirSemanas?: number;
    }) => post<SalidaExperiencia[]>('/salidas', datos),
    cambiarEstadoSalida: (id: string, estado: 'realizada' | 'cancelada') =>
      solicitar<SalidaExperiencia>(`/salidas/${id}/estado`, {
        metodo: 'PATCH',
        cuerpo: { estado },
      }),
    tomarCupo: (salidaId: string, datos: QuienToma) =>
      post<CupoExperiencia>(`/salidas/${salidaId}/cupos`, datos),
    cancelarCupo: (id: string) => post<CupoExperiencia>(`/cupos/${id}/cancelar`),
  },

  // B-3: turnos de caja.
  turnos: {
    actual: () => solicitar<{ turno: Turno | null }>('/turnos/actual'),
    abrir: (baseEfectivo: number) => post<Turno>('/turnos/abrir', { baseEfectivo }),
    cerrar: (id: string, efectivoContado: number, observaciones?: string) =>
      post<Turno>(`/turnos/${id}/cerrar`, { efectivoContado, observaciones }),
    listar: (filtro: { desde?: string; hasta?: string; usuarioId?: string } = {}) => {
      const query = new URLSearchParams();
      for (const [clave, valor] of Object.entries(filtro)) if (valor) query.set(clave, valor);
      return solicitar<Turno[]>(`/turnos?${query}`);
    },
    sinTurno: () =>
      solicitar<{ desde: string | null; pagos: PagoSinTurno[]; anulaciones: PagoSinTurno[] }>(
        '/turnos/sin-turno',
      ),
  },

  // B-2: pagos en línea (links de pago, la cuenta de Wompi y las páginas
  // públicas que ve el huésped).
  pagosEnLinea: {
    estado: () => solicitar<EstadoPasarela>('/pagos-en-linea/estado'),
    crearLink: (reservaId: string, monto?: number) =>
      post<IntentoPago>(`/reservas/${reservaId}/link-de-pago`, { monto }),
    intentos: (reservaId: string) =>
      solicitar<IntentoPago[]>(`/reservas/${reservaId}/intentos-de-pago`),
    guardarLlaves: (llaves: LlavesWompi) =>
      solicitar<EstadoPasarela>('/pagos-en-linea/llaves', { metodo: 'PUT', cuerpo: llaves }),
    probar: () => post<{ ok: boolean; mensaje: string }>('/pagos-en-linea/probar'),
    pagoSimulado: (referencia: string) =>
      solicitar<PagoPublico>(`/publico/pago-simulado/${encodeURIComponent(referencia)}`),
    decidirSimulado: (referencia: string, aprobar: boolean) =>
      post<PagoPublico>(`/publico/pago-simulado/${encodeURIComponent(referencia)}`, { aprobar }),
    estadoPublico: (referencia: string) =>
      solicitar<PagoPublico>(`/publico/pagos/${encodeURIComponent(referencia)}/estado`),
  },

  // B-5: empresas que pagan reservas.
  empresas: {
    buscar: (buscar?: string) =>
      solicitar<Empresa[]>(`/empresas${buscar ? `?buscar=${encodeURIComponent(buscar)}` : ''}`),
    crear: (datos: NuevaEmpresa) => post<Empresa>('/empresas', datos),
    actualizar: (id: string, cambios: Partial<NuevaEmpresa>) =>
      solicitar<Empresa>(`/empresas/${id}`, { metodo: 'PATCH', cuerpo: cambios }),
    estadoDeCuenta: (id: string) =>
      solicitar<EstadoCuentaEmpresa>(`/empresas/${id}/estado-de-cuenta`),
    abonar: (
      id: string,
      datos: {
        pagos: { reservaId: string; monto: number }[];
        medio: MedioPago;
        referencia?: string;
      },
    ) => post<{ pagos: number; total: number }>(`/empresas/${id}/abonos`, datos),
  },

  // B-4: tareas de limpieza del día e incidencias de las habitaciones.
  limpieza: {
    tareas: (filtro: { fecha?: string; asignadaA?: string } = {}) => {
      const query = new URLSearchParams();
      for (const [clave, valor] of Object.entries(filtro)) if (valor) query.set(clave, valor);
      return solicitar<TareasDelDia>(`/limpieza/tareas?${query}`);
    },
    personal: () =>
      solicitar<{ id: string; nombre: string; rol: RolUsuario }[]>('/limpieza/tareas/personal'),
    crear: (datos: { habitacionId: string; tipo: TipoTareaLimpieza; asignadaAId?: string }) =>
      post<TareaLimpieza>('/limpieza/tareas', datos),
    asignar: (tareaIds: string[], usuarioId: string | null) =>
      post<{ asignadas: number }>('/limpieza/tareas/asignar', { tareaIds, usuarioId }),
    avanzar: (id: string, accion: 'iniciar' | 'terminar', observaciones?: string) =>
      solicitar<TareaLimpieza>(`/limpieza/tareas/${id}`, {
        metodo: 'PATCH',
        cuerpo: { accion, observaciones },
      }),
  },
  incidencias: {
    listar: (estado?: 'abierta' | 'resuelta') =>
      solicitar<Incidencia[]>(`/incidencias${estado ? `?estado=${estado}` : ''}`),
    reportar: (datos: {
      habitacionId: string;
      descripcion: string;
      prioridad: PrioridadIncidencia;
      sacaDeServicio: boolean;
    }) => post<Incidencia>('/incidencias', datos),
    resolver: (id: string, solucion?: string) =>
      solicitar<Incidencia>(`/incidencias/${id}`, { metodo: 'PATCH', cuerpo: { solucion } }),
  },

  // Reglas del hotel: aplican a las reservas nuevas.
  actualizarPoliticas: (cambios: Partial<PoliticasHotel>) =>
    solicitar<Hotel>('/hotel/politicas', { metodo: 'PATCH', cuerpo: cambios }),

  // Equipo del propio hotel (Gerencia).
  equipo: {
    listar: () => solicitar<Usuario[]>('/usuarios'),
    crear: (datos: NuevoUsuario) => post<Usuario>('/usuarios', datos),
    actualizar: (id: string, cambios: { rol?: RolDeHotel; activo?: boolean }) =>
      solicitar<Usuario>(`/usuarios/${id}`, { metodo: 'PATCH', cuerpo: cambios }),
    restablecer: (id: string, nueva: string) =>
      post<void>(`/usuarios/${id}/restablecer-contrasena`, { nueva }),
  } satisfies GestionEquipo,

  // Consola Lazaro.
  plataforma: {
    hoteles: () => solicitar<HotelResumen[]>('/plataforma/hoteles'),
    crearHotel: (datos: NuevoHotel) => post<HotelResumen>('/plataforma/hoteles', datos),
    actualizarHotel: (
      id: string,
      cambios: { activo?: boolean; nombre?: string; ciudad?: string },
    ) => solicitar<HotelResumen>(`/plataforma/hoteles/${id}`, { metodo: 'PATCH', cuerpo: cambios }),
    // Personal de un hotel cualquiera, con la misma forma que el equipo propio.
    equipoDe: (hotelId: string): GestionEquipo => ({
      listar: () => solicitar<Usuario[]>(`/plataforma/hoteles/${hotelId}/usuarios`),
      crear: (datos) => post<Usuario>(`/plataforma/hoteles/${hotelId}/usuarios`, datos),
      actualizar: (id, cambios) =>
        solicitar<Usuario>(`/plataforma/hoteles/${hotelId}/usuarios/${id}`, {
          metodo: 'PATCH',
          cuerpo: cambios,
        }),
      restablecer: (id, nueva) =>
        post<void>(`/plataforma/hoteles/${hotelId}/usuarios/${id}/restablecer-contrasena`, {
          nueva,
        }),
    }),
  },
};
