import type { Habitacion, Reserva, RolUsuario, Sesion, Usuario, UsuarioSesion } from './types';

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
  tipo: string;
  tarifaNoche: number;
}

export interface NuevaReserva {
  habitacionId: string;
  huesped: {
    nombre: string;
    documento: string;
    telefono?: string;
  };
  fechaEntrada: string;
  fechaSalida: string;
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

  cambiarContrasena: (actual: string, nueva: string) =>
    post<void>('/auth/cambiar-contrasena', { actual, nueva }),

  listarHabitaciones: () => solicitar<Habitacion[]>('/habitaciones'),

  crearHabitacion: (datos: NuevaHabitacion) => post<Habitacion>('/habitaciones', datos),

  disponibles: (desde: string, hasta: string) =>
    solicitar<Habitacion[]>(`/habitaciones/disponibles?desde=${desde}&hasta=${hasta}`),

  listarReservas: () => solicitar<Reserva[]>('/reservas'),

  crearReserva: (datos: NuevaReserva) => post<Reserva>('/reservas', datos),

  checkIn: (id: string) => post<Reserva>(`/reservas/${id}/check-in`),

  checkOut: (id: string) => post<Reserva>(`/reservas/${id}/check-out`),

  cancelar: (id: string) => post<Reserva>(`/reservas/${id}/cancelar`),

  procesarNoShows: () => post<{ marcadas: string[] }>('/reservas/no-shows/procesar'),

  listarUsuarios: () => solicitar<Usuario[]>('/usuarios'),

  crearUsuario: (datos: NuevoUsuario) => post<Usuario>('/usuarios', datos),

  actualizarUsuario: (id: string, cambios: { rol?: RolUsuario; activo?: boolean }) =>
    solicitar<Usuario>(`/usuarios/${id}`, { metodo: 'PATCH', cuerpo: cambios }),

  restablecerContrasena: (id: string, nueva: string) =>
    post<void>(`/usuarios/${id}/restablecer-contrasena`, { nueva }),
};
