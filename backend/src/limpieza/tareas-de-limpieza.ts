import { Prisma } from '@prisma/client';
import { fechaDelHotel } from '../hotel/politicas';

type Transaccion = Prisma.TransactionClient;

// B-4: ayudantes que usan otros módulos dentro de sus propias transacciones.

// El check-out (y el cambio de habitación con la estadía en curso) deja la
// habitación en limpieza: nace la tarea "salida" del día. Si ya había una ese
// día (otra salida en la misma habitación), vuelve a quedar pendiente.
export function crearTareaSalida(
  tx: Transaccion,
  hotelId: string,
  habitacionId: string,
  ahora: Date,
) {
  const fecha = fechaDelHotel(ahora);
  return tx.tareaLimpieza.upsert({
    where: { habitacionId_fecha_tipo: { habitacionId, fecha, tipo: 'salida' } },
    create: { hotelId, habitacionId, fecha, tipo: 'salida', creadaEn: ahora },
    update: { estado: 'pendiente', inicio: null, fin: null },
  });
}

// Marcar lista una habitación desde el tablero cierra su tarea "salida": la
// limpieza ya se hizo, aunque nadie la haya marcado en la lista.
export function cerrarTareasSalida(tx: Transaccion, habitacionIds: string[], ahora: Date) {
  return tx.tareaLimpieza.updateMany({
    where: { habitacionId: { in: habitacionIds }, tipo: 'salida', estado: { not: 'terminada' } },
    data: { estado: 'terminada', fin: ahora },
  });
}
