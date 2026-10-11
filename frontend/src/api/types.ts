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

// R12: precio y capacidad se definen por tipo de habitación.
export interface TipoHabitacion {
  id: string;
  codigo: string;
  nombre: string;
  tarifaBase: string; // por noche en temporada baja
  capacidadIncluida: number;
  capacidadMaxima: number;
  cargoPersonaAdicional: string;
  _count?: { habitaciones: number };
}

export interface Habitacion {
  id: string;
  numero: string;
  estado: EstadoHabitacion;
  tipoHabitacionId: string;
  tipoHabitacion: TipoHabitacion;
}

export type Temporada = 'baja' | 'media' | 'alta';

// Precio desglosado noche por noche (backend: tarifas/motor-tarificacion.ts).
export interface Desglose {
  noches: { fecha: string; temporada: Temporada; motivo: string | null; tarifa: number }[];
  huespedes: number;
  personasAdicionales: number;
  cargoPersonaAdicionalPorNoche: number;
  alojamiento: number;
  adicionales: number;
  subtotal: number;
  iva: { porcentaje: number; valor: number; exento: boolean };
  total: number;
}

// Disponibilidad: cada habitación con su precio para el rango (con IVA).
export interface HabitacionDisponible extends Habitacion {
  cotizacion: Desglose;
}

export interface CalendarioTemporadas {
  anio: number;
  multiplicadores: Record<Temporada, number>;
  ivaPorcentaje: number;
  periodos: { desde: string; hasta: string; temporada: Temporada; motivo: string }[];
}

// Reserva en las listas del panel: atrasada = llegada de ayer o salida vencida.
export interface ReservaPendiente extends Omit<Reserva, 'noches' | 'cancelacionGratuitaHasta'> {
  atrasada: boolean;
}

export interface PanelHoy {
  fecha: string;
  ocupacion: { habitacionesOcupadas: number; totalHabitaciones: number; porcentaje: number };
  huespedesAlojados: number;
  llegadas: ReservaPendiente[];
  salidas: ReservaPendiente[];
  ingresosDelMes: { alojamiento: string; penalidades: string; total: string };
}

export interface ReservaCalendario {
  id: string;
  habitacionId: string;
  fechaEntrada: string;
  fechaSalida: string;
  estado: EstadoReserva;
  huesped: { nombre: string };
}

export interface Calendario {
  desde: string;
  dias: number;
  hoy: string;
  habitaciones: Habitacion[];
  reservas: ReservaCalendario[];
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
  numeroHuespedes: number;
  // Precio total pactado al reservar (no cambia si cambia la tarifa).
  valorAlojamiento: string;
  // Desglose congelado; null en reservas anteriores al motor de tarifas.
  desglose: Desglose | null;
  // Monto liquidado: alojamiento al hacer check-out, o penalidad al cancelar / no-show.
  total: string | null;
  noches: number;
  cancelacionGratuitaHasta: string;
  createdAt: string;
  habitacion: Habitacion;
  huesped: Huesped;
}
