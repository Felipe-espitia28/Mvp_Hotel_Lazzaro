// Tipos que reflejan las entidades expuestas por el backend.

// plataforma: equipo de Lazaro (Consola Lazaro). admin y recepcionista: personal de un hotel.
export type RolUsuario = 'plataforma' | 'admin' | 'recepcionista';
export type RolDeHotel = Exclude<RolUsuario, 'plataforma'>;

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
  | 'usuarios:gestionar'
  | 'hotel:configurar'
  | 'plataforma:gestionar';

// Usuario con sesión abierta, tal como lo devuelve el login.
export interface UsuarioSesion {
  id: string;
  nombre: string;
  email: string;
  rol: RolUsuario;
  // null para el equipo de Lazaro.
  hotelId: string | null;
  permisos: Permiso[];
}

export type MedioPagoHabilitado = 'efectivo' | 'tarjeta' | 'transferencia';

// Reglas del hotel (backend/src/hotel/politicas.ts), ya completas.
export interface PoliticasHotel {
  horaCheckIn: number;
  horaCheckOut: number;
  estadiaMaximaNoches: number;
  antelacionMaximaDias: number;
  horasCancelacionGratuita: number;
  nochesPenalidad: number;
  multiplicadorTemporada: Record<Temporada, number>;
  ivaPorcentaje: number;
  exencionIvaPasaporte: boolean;
  mediosPago: MedioPagoHabilitado[];
  puentesFestivosMedia: boolean;
  semanaSantaAlta: boolean;
  // A-3: hasta esta edad un niño no paga; hasta edadMaximaNino, tarifa de niño.
  edadMaximaNinoGratis: number;
  edadMaximaNino: number;
}

// Identidad visual de un hotel.
export interface MarcaHotel {
  slug: string;
  nombre: string;
  eslogan: string | null;
  logo: string | null;
  colorPrimario: string;
  colorAcento: string;
  fuenteTitulos: string;
  fuenteTexto: string;
}

// El hotel tal como lo ve su personal (GET /hotel).
export interface Hotel extends MarcaHotel {
  id: string;
  ciudad: string | null;
  nit: string | null;
  telefono: string | null;
  // Dato de la TRA (MinCIT): hotel, hostal, apartahotel...
  tipoAlojamiento: string;
  activo: boolean;
  politicas: PoliticasHotel;
}

// Rango de temporada propio del hotel, repetido cada año. desde/hasta son mes y
// día como número (1215 = 15 de diciembre); si desde > hasta cruza el fin de año.
export interface TemporadaHotel {
  id: string;
  nombre: string;
  tipo: 'alta' | 'media';
  desde: number;
  hasta: number;
  activa: boolean;
}

// Producto del catálogo de consumos del hotel (precio final por unidad).
export interface ProductoConsumo {
  id: string;
  nombre: string;
  categoria: CategoriaCargo;
  precio: string;
  activo: boolean;
}

// Un hotel en la lista de la Consola Lazaro.
export interface HotelResumen {
  id: string;
  slug: string;
  nombre: string;
  ciudad: string | null;
  activo: boolean;
  logo: string | null;
  colorPrimario: string;
  colorAcento: string;
  createdAt: string;
  habitaciones: number;
  usuarios: number;
  ocupadasEstaNoche: number;
  reservasDelMes: number;
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
  // A-3: por niño con cargo y por noche.
  cargoNinoAdicional: string;
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
// Los campos de niños (A-3) no existen en los desgloses anteriores: se tratan como 0.
export interface Desglose {
  noches: { fecha: string; temporada: Temporada; motivo: string | null; tarifa: number }[];
  huespedes: number;
  adultos?: number;
  ninos?: { gratis: number; conCargo: number };
  rangosEdad?: { gratisHasta: number; ninoHasta: number };
  personasAdicionales: number;
  cargoPersonaAdicionalPorNoche: number;
  cargoNinoPorNoche?: number;
  alojamiento: number;
  adicionales: number;
  ninosAdicionales?: number;
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
  | 'cargo_anulado'
  | 'diferencia_edad';

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

export type TipoDocumento = 'CC' | 'CE' | 'PASAPORTE' | 'TI' | 'PPT' | 'RC' | 'PEP';

// R44: relación de un menor con el adulto responsable.
export type Parentesco = 'padre_madre' | 'familiar' | 'tutor_legal' | 'tercero_autorizado';

export interface Huesped {
  id: string;
  // Nombre completo, calculado por el backend a partir de las partes.
  nombre: string;
  primerNombre: string;
  segundoNombre: string | null;
  // '' = por completar (registrado antes de separar nombres y apellidos).
  primerApellido: string;
  segundoApellido: string | null;
  tipoDocumento: TipoDocumento;
  documento: string;
  telefono: string | null;
  email: string | null;
  fechaNacimiento: string | null;
  // R19: código de país (CO, VE, US...), registrado en el check-in.
  nacionalidad: string | null;
  paisResidencia: string | null;
  ciudadResidencia: string | null;
  // R43: tiene todos los datos que exige el registro legal.
  datosCompletos: boolean;
}

export type MotivoViaje = 'turismo' | 'negocios' | 'salud' | 'eventos' | 'otro';

// R43: una persona que se aloja, tal como se envía en el check-in.
export interface OcupanteCheckIn {
  titular: boolean;
  tipoDocumento: TipoDocumento;
  documento: string;
  primerNombre?: string;
  segundoNombre?: string;
  primerApellido?: string;
  segundoApellido?: string;
  fechaNacimiento?: string;
  nacionalidad?: string;
  paisResidencia?: string;
  ciudadResidencia?: string;
  paisProcedencia?: string;
  ciudadProcedencia?: string;
  // R44: solo para menores.
  responsableIndice?: number;
  parentesco?: Parentesco;
  autorizacionVerificada?: boolean;
  // R45: solo para adultos.
  aceptaPoliticaDatos?: boolean;
}

// R19, R43: el check-in registra a todos los ocupantes de la reserva.
export interface RegistroCheckIn {
  motivoViaje: MotivoViaje;
  ocupantes: OcupanteCheckIn[];
}

// Un problema del check-in, con el ocupante (índice) y el campo que lo tiene;
// null = de la reserva entera.
export interface ProblemaRegistro {
  ocupante: number | null;
  campo: string | null;
  mensaje: string;
}

// R45: una versión de la política de tratamiento de datos del hotel.
export interface PoliticaDatos {
  id: string;
  version: number;
  texto: string;
  vigenteDesde: string;
}

// Una persona del registro hotelero.
export interface OcupanteRegistro {
  titular: boolean;
  nombre: string;
  tipoDocumento: TipoDocumento;
  documento: string;
  fechaNacimiento: string | null;
  edad: number | null;
  nacionalidad: string | null;
  paisResidencia: string | null;
  ciudadResidencia: string | null;
  paisProcedencia: string | null;
  ciudadProcedencia: string | null;
  parentesco: Parentesco | null;
  extranjero: boolean;
  menor: boolean;
}

// Una reserva del registro hotelero del día, con todos sus ocupantes.
export interface FilaRegistroHotelero {
  reservaId: string;
  habitacion: string;
  nombre: string;
  tipoDocumento: TipoDocumento;
  documento: string;
  nacionalidad: string | null;
  procedencia: string | null;
  motivoViaje: MotivoViaje | null;
  numeroHuespedes: number;
  fechaEntrada: string;
  fechaSalida: string;
  extranjero: boolean;
  ocupantes: OcupanteRegistro[];
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
  // A-3: adultos y edad declarada de cada niño; numeroHuespedes es su total.
  adultos: number;
  edadesNinos: number[];
  numeroHuespedes: number;
  // Precio total pactado al reservar (no cambia si cambia la tarifa).
  valorAlojamiento: string;
  // Desglose congelado; null en reservas anteriores al motor de tarifas.
  desglose: Desglose | null;
  // Se registra al liquidar el folio en el check-out.
  medioPago: MedioPago | null;
  // R19: motivo del viaje, registrado en el check-in.
  motivoViaje: MotivoViaje | null;
  // Monto liquidado: alojamiento al hacer check-out, o penalidad al cancelar / no-show.
  total: string | null;
  noches: number;
  cancelacionGratuitaHasta: string;
  createdAt: string;
  habitacion: Habitacion;
  huesped: Huesped;
}
