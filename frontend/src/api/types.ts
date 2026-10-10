// Tipos que reflejan las entidades expuestas por el backend.

export type RolUsuario = 'admin' | 'recepcionista';

// Permisos que el backend asigna a cada rol (ver backend/src/auth/permisos.ts).
export type Permiso =
  | 'habitaciones:ver'
  | 'habitaciones:gestionar'
  | 'reservas:ver'
  | 'reservas:gestionar'
  | 'estadias:gestionar'
  | 'no-shows:procesar'
  | 'usuarios:gestionar';

// Usuario con sesión abierta, tal como lo devuelve el login.
export interface UsuarioSesion {
  id: string;
  nombre: string;
  email: string;
  rol: RolUsuario;
  permisos: Permiso[];
}

export interface Sesion {
  token: string;
  usuario: UsuarioSesion;
}

// Usuario en la pantalla de gestión.
export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: RolUsuario;
  activo: boolean;
  createdAt: string;
}

export type EstadoHabitacion = 'libre' | 'ocupada';

export type EstadoReserva = 'confirmada' | 'activa' | 'cerrada' | 'cancelada' | 'no_show';

export interface Habitacion {
  id: string;
  numero: string;
  tipo: string;
  tarifaNoche: string;
  estado: EstadoHabitacion;
}

export type TipoEventoReserva = 'creada' | 'check_in' | 'check_out' | 'cancelada' | 'no_show';

// Auditoría: una acción sobre la reserva. usuario null = acción automática del sistema.
export interface EventoReserva {
  id: string;
  tipo: TipoEventoReserva;
  fecha: string;
  detalle: string | null;
  usuario: { nombre: string; rol: RolUsuario } | null;
}

export type TipoDocumento = 'CC' | 'CE' | 'PASAPORTE' | 'TI' | 'PPT';

export interface Huesped {
  id: string;
  nombre: string;
  tipoDocumento: TipoDocumento;
  documento: string;
  telefono: string | null;
}

// Resultado de búsqueda: incluye cuántas reservas tiene.
export interface HuespedResumen extends Huesped {
  _count: { reservas: number };
}

// Ficha del huésped con su historial.
export interface HuespedDetalle extends Huesped {
  reservas: (Omit<Reserva, 'huesped' | 'noches' | 'cancelacionGratuitaHasta'> & {
    habitacion: Habitacion;
  })[];
}

export interface Reserva {
  id: string;
  habitacionId: string;
  huespedId: string;
  fechaEntrada: string;
  fechaSalida: string;
  estado: EstadoReserva;
  // Precio de las noches pactado al reservar (no cambia si cambia la tarifa).
  valorAlojamiento: string;
  // Monto liquidado: alojamiento al hacer check-out, o penalidad al cancelar / no-show.
  total: string | null;
  noches: number;
  cancelacionGratuitaHasta: string;
  createdAt: string;
  habitacion: Habitacion;
  huesped: Huesped;
}
