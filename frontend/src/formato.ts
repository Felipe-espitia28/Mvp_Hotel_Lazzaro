import type { EstadoReserva, RolUsuario } from './api/types';

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
export function hoyISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}

export const ETIQUETA_ROL: Record<RolUsuario, string> = {
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
