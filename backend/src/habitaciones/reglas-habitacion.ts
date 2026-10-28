import { BadRequestException } from '@nestjs/common';
import { Habitacion, Prisma, TipoHabitacion } from '@prisma/client';

// Reglas de una habitación que comparten el cambio uno a uno y las
// operaciones en lote (A-4): el lote las aplica a cada habitación y agrupa
// los errores y los avisos.

type Cliente = Prisma.TransactionClient;

// R25/R26: una habitación con un huésped alojado se libera con el check-out,
// no a mano.
export function exigirSinHuesped(habitaciones: Pick<Habitacion, 'numero' | 'estado'>[]) {
  const ocupadas = habitaciones.filter((h) => h.estado === 'ocupada').map((h) => h.numero);
  if (ocupadas.length === 1) {
    throw new BadRequestException(
      `La habitación ${ocupadas[0]} tiene un huésped alojado: se libera con el check-out`,
    );
  }
  if (ocupadas.length > 1) {
    throw new BadRequestException(
      `Las habitaciones ${ocupadas.join(', ')} tienen huéspedes alojados: se liberan con el check-out`,
    );
  }
}

// Reservas confirmadas que aún no terminan, por habitación: las que hay que
// reubicar si sale de servicio (R26) o que cambian de tipo (R53).
export async function reservasFuturas(
  cliente: Cliente,
  habitaciones: Pick<Habitacion, 'id' | 'numero'>[],
  hoy: Date,
) {
  const grupos = await cliente.reserva.groupBy({
    by: ['habitacionId'],
    where: {
      habitacionId: { in: habitaciones.map((h) => h.id) },
      estado: 'confirmada',
      fechaSalida: { gt: hoy },
    },
    _count: { _all: true },
  });
  const porId = new Map(grupos.map((g) => [g.habitacionId, g._count._all]));
  return habitaciones
    .filter((h) => porId.has(h.id))
    .map((h) => ({ numero: h.numero, reservas: porId.get(h.id)! }));
}

// R53: una habitación cambia de tipo aunque tenga reservas (conservan el
// precio pactado), pero no a uno con menos capacidad que los huéspedes ya
// reservados. Devuelve un error por habitación que no cabe.
export async function reservasQueNoCaben(
  cliente: Cliente,
  cambios: { habitacion: Pick<Habitacion, 'id' | 'numero'>; tipo: TipoHabitacion }[],
  hoy: Date,
) {
  if (cambios.length === 0) return new Map<string, string>();
  const reservas = await cliente.reserva.findMany({
    where: {
      habitacionId: { in: cambios.map((c) => c.habitacion.id) },
      estado: { in: ['confirmada', 'activa'] },
      fechaSalida: { gt: hoy },
    },
    select: { habitacionId: true, adultos: true, edadesNinos: true },
  });
  const errores = new Map<string, string>();
  for (const { habitacion, tipo } of cambios) {
    const mayor = Math.max(
      0,
      ...reservas
        .filter((r) => r.habitacionId === habitacion.id)
        .map((r) => r.adultos + r.edadesNinos.length),
    );
    if (mayor > tipo.capacidadMaxima) {
      errores.set(
        habitacion.id,
        `La habitación ${habitacion.numero} tiene una reserva de ${mayor} huéspedes y el tipo ${tipo.nombre} admite hasta ${tipo.capacidadMaxima}`,
      );
    }
  }
  return errores;
}
