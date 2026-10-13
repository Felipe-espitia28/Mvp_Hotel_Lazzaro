// Tipos que reflejan las entidades expuestas por el backend.

export type RolUsuario = 'admin' | 'recepcionista';

// Permisos que el backend asigna a cada rol (ver backend/src/auth/permisos.ts).
export type Permiso =
  | 'habitaciones:ver'
  | 'habitaciones:gestionar'
  | 'habitaciones:estado'
  | 'reservas:ver'
  | 'reservas:gestionar'
  | 'estadias:gestionar'
  | 'folio:gestionar'
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

// R25: libre → ocupada → en_limpieza → libre. R26: fuera_servicio.
export type EstadoHabitacion = 'libre' | 'ocupada' | 'en_limpieza' | 'fuera_servicio';

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
  habitaciones: { porLimpiar: number; fueraDeServicio: number };
  huespedesAlojados: number;
  llegadas: ReservaPendiente[];
  salidas: ReservaPendiente[];
  ingresosDelMes: { alojamiento: string; consumos: string; penalidades: string; total: string };
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

export type TipoEventoReserva =
  | 'creada'
  | 'check_in'
  | 'check_out'
  | 'cancelada'
  | 'no_show'
  | 'cargo_agregado'
  | 'cargo_anulado';

export type CategoriaCargo = 'minibar' | 'lavanderia' | 'restaurante' | 'late_checkout' | 'otro';

export type MedioPago = 'efectivo' | 'tarjeta' | 'transferencia';

// Consumo cargado a la habitación (R20–R22). Se anula, no se borra.
export interface Cargo {
  id: string;
  categoria: CategoriaCargo;
  concepto: string;
  cantidad: number;
  valorUnitario: string;
  total: string;
  fecha: string;
  anulado: boolean;
  motivoAnulacion: string | null;
  usuario: { nombre: string };
}

// Cuenta de la estadía: alojamiento pactado + consumos vigentes.
export interface Folio {
  reservaId: string;
  estado: EstadoReserva;
  medioPago: MedioPago | null;
  alojamiento: string;
  consumos: string;
  total: string;
  // R24: si el check-out fuera ahora y antes de lo pactado, qué se cobraría.
  salidaAnticipada: {
    nochesPactadas: number;
    nochesACobrar: number;
    alojamientoACobrar: string;
    totalACobrar: string;
  } | null;
  cargos: Cargo[];
}

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
  // Se registra al liquidar el folio en el check-out.
  medioPago: MedioPago | null;
  // Monto liquidado: alojamiento al hacer check-out, o penalidad al cancelar / no-show.
  total: string | null;
  noches: number;
  cancelacionGratuitaHasta: string;
  createdAt: string;
  habitacion: Habitacion;
  huesped: Huesped;
}
