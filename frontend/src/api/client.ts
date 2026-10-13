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
  Habitacion,
  HuespedDetalle,
  HuespedResumen,
  Reserva,
  RolUsuario,
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
    throw new ApiError(mensaje, respuesta.status);
  }
  return (respuesta.status === 204 ? undefined : await respuesta.json()) as T;
}

export interface NuevaHabitacion {
  numero: string;
  tipoHabitacionId: string;
}

export type DatosTipoHabitacion = Omit<
  TipoHabitacion,
  'id' | '_count' | 'tarifaBase' | 'cargoPersonaAdicional'
> & {
  tarifaBase: number;
  cargoPersonaAdicional: number;
};

export interface NuevaReserva {
  habitacionId: string;
  huesped: {
    nombre: string;
    tipoDocumento: TipoDocumento;
    documento: string;
    telefono?: string;
  };
  numeroHuespedes: number;
  fechaEntrada: string;
  fechaSalida: string;
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

export interface NuevoCargo {
  categoria: CategoriaCargo;
  concepto: string;
  cantidad: number;
  valorUnitario: number;
}

export interface NuevoUsuario {
  nombre: string;
  email: string;
  contrasena: string;
  rol: RolUsuario;
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

  // desde: YYYY-MM-DD (por defecto, hoy en el hotel).
  calendario: (desde?: string, dias = 14) =>
    solicitar<Calendario>(`/panel/calendario?dias=${dias}${desde ? `&desde=${desde}` : ''}`),

  listarHabitaciones: () => solicitar<Habitacion[]>('/habitaciones'),

  crearHabitacion: (datos: NuevaHabitacion) => post<Habitacion>('/habitaciones', datos),

  disponibles: (desde: string, hasta: string, huespedes = 1) =>
    solicitar<HabitacionDisponible[]>(
      `/habitaciones/disponibles?desde=${desde}&hasta=${hasta}&huespedes=${huespedes}`,
    ),

  // Marcar lista ("libre") o sacar de servicio ("fuera_servicio").
  cambiarEstadoHabitacion: (id: string, estado: 'libre' | 'fuera_servicio') =>
    solicitar<Habitacion & { reservasAfectadas: number }>(`/habitaciones/${id}/estado`, {
      metodo: 'PATCH',
      cuerpo: { estado },
    }),

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

  checkIn: (id: string, registro: RegistroCheckIn) =>
    post<Reserva>(`/reservas/${id}/check-in`, registro),

  // R19: registro hotelero de un día de llegada (YYYY-MM-DD; por defecto hoy).
  registroHotelero: (fecha?: string) =>
    solicitar<{ fecha: string; registros: FilaRegistroHotelero[] }>(
      `/reservas/registro-hotelero${fecha ? `?fecha=${fecha}` : ''}`,
    ),

  checkOut: (id: string, medioPago: MedioPago) =>
    post<Reserva>(`/reservas/${id}/check-out`, { medioPago }),

  folio: (id: string) => solicitar<Folio>(`/reservas/${id}/folio`),

  agregarCargo: (id: string, cargo: NuevoCargo) => post<Folio>(`/reservas/${id}/cargos`, cargo),

  anularCargo: (id: string, cargoId: string, motivo: string) =>
    post<Folio>(`/reservas/${id}/cargos/${cargoId}/anular`, { motivo }),

  cancelar: (id: string) => post<Reserva>(`/reservas/${id}/cancelar`),

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

  listarUsuarios: () => solicitar<Usuario[]>('/usuarios'),

  crearUsuario: (datos: NuevoUsuario) => post<Usuario>('/usuarios', datos),

  actualizarUsuario: (id: string, cambios: { rol?: RolUsuario; activo?: boolean }) =>
    solicitar<Usuario>(`/usuarios/${id}`, { metodo: 'PATCH', cuerpo: cambios }),

  restablecerContrasena: (id: string, nueva: string) =>
    post<void>(`/usuarios/${id}/restablecer-contrasena`, { nueva }),
};
