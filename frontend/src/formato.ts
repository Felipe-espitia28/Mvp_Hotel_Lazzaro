import type {
  CategoriaCargo,
  EstadoHabitacion,
  EstadoReserva,
  MedioPago,
  MotivoViaje,
  RolUsuario,
  TipoDocumento,
} from './api/types';

// Utilidades de presentación compartidas por las pantallas.

export function formatearDinero(valor: string | number) {
  return `$${Number(valor).toLocaleString('es-CO')}`;
}

// Las fechas de reserva son días de calendario (llegan a medianoche UTC).
export function formatearFecha(fecha: string) {
  return new Date(fecha).toLocaleDateString('es-CO', { timeZone: 'UTC' });
}

// Instantes reales (p. ej. el límite de cancelación) se muestran en hora de Colombia.
export function formatearFechaHora(instante: string) {
  return new Date(instante).toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Condición de cancelación de una reserva confirmada (R9), en lenguaje del recepcionista.
export function textoCancelacion(cancelacionGratuitaHasta: string) {
  return new Date() <= new Date(cancelacionGratuitaHasta)
    ? `Cancelación gratuita hasta el ${formatearFechaHora(cancelacionGratuitaHasta)}`
    : 'Cancelar ahora cobra 1 noche de penalidad';
}

// Fecha de hoy en formato YYYY-MM-DD (para el mínimo de los campos de fecha).
// Hora del día (0–23) en formato colombiano: 15 → "3:00 p. m.".
export function formatearHora(hora: number) {
  return new Date(Date.UTC(2000, 0, 1, hora)).toLocaleTimeString('es-CO', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}

export function hoyISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}

export const ETIQUETA_TIPO_DOCUMENTO: Record<TipoDocumento, string> = {
  CC: 'Cédula de ciudadanía',
  CE: 'Cédula de extranjería',
  PASAPORTE: 'Pasaporte',
  TI: 'Tarjeta de identidad',
  PPT: 'Permiso por protección temporal',
};

export const ETIQUETA_ESTADO_HABITACION: Record<EstadoHabitacion, string> = {
  libre: 'Libre',
  ocupada: 'Ocupada',
  en_limpieza: 'En limpieza',
  fuera_servicio: 'Fuera de servicio',
};

export const ETIQUETA_MOTIVO_VIAJE: Record<MotivoViaje, string> = {
  turismo: 'Turismo',
  negocios: 'Negocios',
  salud: 'Salud',
  eventos: 'Eventos',
  otro: 'Otro',
};

// Nacionalidades más frecuentes (código ISO 3166-1 alfa-2). La lista completa
// queda para la integración con la Tarjeta de Registro Hotelero.
export const PAISES: Record<string, string> = {
  CO: 'Colombia',
  VE: 'Venezuela',
  EC: 'Ecuador',
  PE: 'Perú',
  PA: 'Panamá',
  MX: 'México',
  AR: 'Argentina',
  CL: 'Chile',
  BR: 'Brasil',
  US: 'Estados Unidos',
  CA: 'Canadá',
  ES: 'España',
  FR: 'Francia',
  DE: 'Alemania',
  IT: 'Italia',
  GB: 'Reino Unido',
};

export const nombrePais = (codigo: string | null) => (codigo ? (PAISES[codigo] ?? codigo) : '—');

export const ETIQUETA_CATEGORIA: Record<CategoriaCargo, string> = {
  minibar: 'Minibar',
  lavanderia: 'Lavandería',
  restaurante: 'Restaurante / bar',
  late_checkout: 'Late check-out',
  otro: 'Otro',
};

export const ETIQUETA_MEDIO_PAGO: Record<MedioPago, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
};

export const ETIQUETA_ROL: Record<RolUsuario, string> = {
  plataforma: 'Equipo Lazaro',
  admin: 'Administrador',
  recepcionista: 'Recepcionista',
};

export const ETIQUETA_ESTADO: Record<EstadoReserva, string> = {
  confirmada: 'Confirmada',
  activa: 'En el hotel',
  cerrada: 'Cerrada',
  cancelada: 'Cancelada',
  no_show: 'No-show',
};
