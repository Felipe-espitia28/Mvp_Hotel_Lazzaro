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
  | 'reportes-legales:ver'
  | 'usuarios:gestionar'
  | 'hotel:configurar'
  | 'pagos:anular'
  | 'cuentas:por-cobrar'
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
  // A-2: anticipo sugerido (% del total); obligatorio solo marca, no bloquea.
  anticipoPorcentaje: number;
  anticipoObligatorio: boolean;
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
  // A-4: se infiere del número si no se dio (101 → 1).
  piso: number | null;
  descripcion: string | null;
}

// A-4: informe de una importación (backend: importacion/importacion.ts). Genérico:
// el plan 09 lo reutiliza. `numero` es la clave natural de cada fila.
export interface InformeImportacion {
  filas: {
    fila: number;
    numero: string;
    estado: 'crear' | 'actualizar' | 'error';
    errores: string[];
  }[];
  resumen: { total: number; crear: number; actualizar: number; error: number };
}

// Los avisos agrupados de una operación en lote: reservas futuras por habitación.
export interface AvisosLote {
  reservasFuturas: { numero: string; reservas: number }[];
  total: number;
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
  | 'diferencia_edad'
  | 'pago_registrado'
  | 'pago_anulado';

export type CategoriaCargo = 'minibar' | 'lavanderia' | 'restaurante' | 'late_checkout' | 'otro';

export type MedioPago = 'efectivo' | 'tarjeta' | 'transferencia' | 'pasarela' | 'otro';

// A-1: abono = pago de la estadía o del saldo; anticipo = antes de llegar;
// reembolso = dinero que el hotel devuelve.
export type TipoPago = 'abono' | 'anticipo' | 'reembolso';

// A-1: un movimiento del libro de pagos. Un pago no se borra: se anula.
export interface Pago {
  id: string;
  tipo: TipoPago;
  medio: MedioPago;
  monto: string;
  referencia: string | null;
  fecha: string;
  anulado: boolean;
  motivoAnulacion: string | null;
  usuario: { nombre: string } | null;
  anuladoPor: { nombre: string } | null;
}

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

// Cuenta de la estadía (A-1): lo que se debe, lo pagado y el saldo, que el
// backend calcula del libro de pagos (positivo = debe; negativo = a favor).
export interface Folio {
  reservaId: string;
  estado: EstadoReserva;
  alojamiento: string;
  consumos: string;
  total: string;
  // A-2: el anticipo sugerido pactado al reservar (null en reservas anteriores).
  anticipoSugerido: string | null;
  debe: number;
  pagado: number;
  reembolsado: number;
  saldo: number;
  // R24: si el check-out fuera ahora y antes de lo pactado, qué se cobraría.
  salidaAnticipada: {
    nochesPactadas: number;
    nochesACobrar: number;
    alojamientoACobrar: string;
    totalACobrar: string;
    saldoACobrar: number;
  } | null;
  cargos: Cargo[];
  pagos: Pago[];
  // Cargos y pagos en orden de fecha.
  movimientos: (
    | { clase: 'cargo'; fecha: string; registro: Cargo }
    | { clase: 'pago'; fecha: string; registro: Pago }
  )[];
}

// A-1: una reserva terminada que aún debe (cerrada con saldo o penalidad sin pagar).
export interface CuentaPorCobrar {
  reservaId: string;
  estado: EstadoReserva;
  habitacion: string;
  huesped: { nombre: string; tipoDocumento: TipoDocumento; documento: string };
  fechaEntrada: string;
  fechaSalida: string;
  debe: number;
  pagado: number;
  saldo: number;
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

// A-6: una fila de la TRA (una por ocupante; acompañantes y valor, solo en el titular).
export interface FilaTra {
  reservaId: string;
  titular: boolean;
  tipoDocumento: TipoDocumento;
  documento: string;
  nombres: string;
  apellidos: string;
  nacionalidad: string;
  paisResidencia: string;
  ciudadResidencia: string;
  codigoCiudadResidencia: string;
  paisProcedencia: string;
  ciudadProcedencia: string;
  codigoCiudadProcedencia: string;
  habitacion: string;
  motivoViaje: string;
  acompanantes: number | '';
  fechaEntrada: string;
  fechaSalida: string;
  tipoAlojamiento: string;
  valorPagado: string;
}

// A-6: un movimiento del SIRE (extranjeros): E al entrar, S al salir.
export interface FilaSire {
  reservaId: string;
  movimiento: 'E' | 'S';
  fecha: string;
  tipoDocumento: TipoDocumento;
  documento: string;
  apellidos: string;
  nombres: string;
  nacionalidad: string;
  fechaNacimiento: string;
}

// A-6: una estadía que no se puede reportar completa, con lo que falta a cada persona.
export interface PendienteLegal {
  reservaId: string;
  habitacion: string;
  fechaEntrada: string;
  titular: { nombre: string; tipoDocumento: TipoDocumento; documento: string } | null;
  personas: { nombre: string; faltan: string[] }[];
}

// A-6: un municipio de la DIVIPOLA del DANE.
export interface Municipio {
  codigo: string;
  nombre: string;
  departamento: string;
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
  // R19: motivo del viaje, registrado en el check-in.
  motivoViaje: MotivoViaje | null;
  // Monto liquidado: alojamiento al hacer check-out, o penalidad al cancelar / no-show.
  total: string | null;
  // A-2: anticipo sugerido pactado al reservar, y si falta pagarlo (solo si el hotel lo exige).
  anticipoSugerido: string | null;
  anticipoPendiente?: boolean;
  noches: number;
  cancelacionGratuitaHasta: string;
  createdAt: string;
  habitacion: Habitacion;
  huesped: Huesped;
}
