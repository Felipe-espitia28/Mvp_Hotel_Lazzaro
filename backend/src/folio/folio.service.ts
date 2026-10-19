import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Reserva } from '@prisma/client';
import { UsuarioAutenticado } from '../auth/decoradores';
import { PrismaService } from '../prisma/prisma.service';
import { Reloj } from '../hotel/reloj';
import { contarNoches, fechaDelHotel, sumarDias } from '../hotel/politicas';
import { Desglose, recortarDesglose } from '../tarifas/motor-tarificacion';
import { AgregarCargoDto } from './folio.dto';

type Transaccion = Prisma.TransactionClient;

// Montos en el detalle de la auditoría, en formato colombiano ($80.000).
export const dinero = (valor: Prisma.Decimal | number) =>
  `$${Number(valor).toLocaleString('es-CO')}`;

// Bloquea la fila de la reserva hasta el fin de la transacción. Así un cargo
// que llega justo durante el check-out espera y no queda fuera de la
// liquidación (ni se agrega a un folio ya cerrado). Solo encuentra reservas
// del hotel indicado.
export async function bloquearReserva(tx: Transaccion, hotelId: string, reservaId: string) {
  await tx.$queryRaw`SELECT id FROM reserva WHERE id = ${reservaId} AND hotel_id = ${hotelId} FOR UPDATE`;
  const reserva = await tx.reserva.findFirst({ where: { id: reservaId, hotelId } });
  if (!reserva) {
    throw new NotFoundException('Reserva no encontrada');
  }
  return reserva;
}

// Suma de los cargos vigentes (no anulados) del folio.
export async function totalCargos(tx: Transaccion | PrismaService, reservaId: string) {
  const { _sum } = await tx.cargo.aggregate({
    where: { reservaId, anulado: false },
    _sum: { total: true },
  });
  return _sum.total ?? new Prisma.Decimal(0);
}

// R24: alojamiento a cobrar si el check-out ocurre en el instante `ahora`.
// Antes de la fecha de salida pactada se cobran solo las noches usadas (mínimo
// una) y la salida se adelanta, liberando las noches restantes. En la fecha
// pactada o después, se cobra lo pactado (la demora se cobra como cargo).
export function liquidarAlojamiento(reserva: Reserva, ahora: Date) {
  const nochesPactadas = contarNoches(reserva.fechaEntrada, reserva.fechaSalida);
  const hoy = fechaDelHotel(ahora);
  const nochesUsadas =
    hoy < reserva.fechaSalida
      ? Math.min(nochesPactadas, Math.max(1, contarNoches(reserva.fechaEntrada, hoy)))
      : nochesPactadas;

  if (nochesUsadas === nochesPactadas) {
    return {
      anticipada: false,
      nochesPactadas,
      nochesUsadas,
      alojamiento: reserva.valorAlojamiento,
      desglose: reserva.desglose as unknown as Desglose | null,
      fechaSalida: reserva.fechaSalida,
    };
  }

  // Reservas anteriores al motor de tarifas (sin desglose): proporcional.
  const desglose = reserva.desglose
    ? recortarDesglose(reserva.desglose as unknown as Desglose, nochesUsadas)
    : null;
  return {
    anticipada: true,
    nochesPactadas,
    nochesUsadas,
    alojamiento: desglose
      ? new Prisma.Decimal(desglose.total)
      : reserva.valorAlojamiento.div(nochesPactadas).mul(nochesUsadas).toDecimalPlaces(2),
    desglose,
    fechaSalida: sumarDias(reserva.fechaEntrada, nochesUsadas),
  };
}

// R21: el folio solo admite movimientos mientras la estadía está activa.
function exigirEstadiaActiva(estado: string) {
  if (estado !== 'activa') {
    throw new BadRequestException(
      `Solo se cargan consumos a una estadía activa (la reserva está "${estado}")`,
    );
  }
}

// Folio (R20–R23): la cuenta de la estadía = alojamiento pactado + consumos.
@Injectable()
export class FolioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reloj: Reloj,
  ) {}

  async folio(hotelId: string, reservaId: string) {
    const reserva = await this.prisma.reserva.findFirst({
      where: { id: reservaId, hotelId },
      include: {
        cargos: {
          include: { usuario: { select: { nombre: true } } },
          orderBy: { fecha: 'asc' },
        },
      },
    });
    if (!reserva) {
      throw new NotFoundException('Reserva no encontrada');
    }

    const consumos = reserva.cargos
      .filter((c) => !c.anulado)
      .reduce((suma, c) => suma.add(c.total), new Prisma.Decimal(0));

    // Con la estadía activa se anticipa cómo quedaría el check-out si fuera
    // ahora: si el huésped se va antes, se cobran solo las noches usadas (R24).
    const liquidacion =
      reserva.estado === 'activa' ? liquidarAlojamiento(reserva, this.reloj.ahora()) : null;

    return {
      reservaId: reserva.id,
      estado: reserva.estado,
      medioPago: reserva.medioPago,
      alojamiento: reserva.valorAlojamiento,
      consumos,
      total: reserva.valorAlojamiento.add(consumos),
      salidaAnticipada: liquidacion?.anticipada
        ? {
            nochesPactadas: liquidacion.nochesPactadas,
            nochesACobrar: liquidacion.nochesUsadas,
            alojamientoACobrar: liquidacion.alojamiento,
            totalACobrar: liquidacion.alojamiento.add(consumos),
          }
        : null,
      cargos: reserva.cargos,
    };
  }

  async agregarCargo(
    hotelId: string,
    reservaId: string,
    dto: AgregarCargoDto,
    quien: UsuarioAutenticado,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const reserva = await bloquearReserva(tx, hotelId, reservaId);
      exigirEstadiaActiva(reserva.estado);

      const total = new Prisma.Decimal(dto.valorUnitario).mul(dto.cantidad);
      await tx.cargo.create({
        data: { ...dto, reservaId, total, usuarioId: quien.id },
      });
      await tx.eventoReserva.create({
        data: {
          reservaId,
          tipo: 'cargo_agregado',
          usuarioId: quien.id,
          detalle: `${dto.concepto} × ${dto.cantidad} · ${dinero(total)}`,
        },
      });
    });
    return this.folio(hotelId, reservaId);
  }

  async anularCargo(
    hotelId: string,
    reservaId: string,
    cargoId: string,
    motivo: string,
    quien: UsuarioAutenticado,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const reserva = await bloquearReserva(tx, hotelId, reservaId);
      exigirEstadiaActiva(reserva.estado);

      const cargo = await tx.cargo.findFirst({ where: { id: cargoId, reservaId } });
      if (!cargo) {
        throw new NotFoundException('Cargo no encontrado en este folio');
      }
      if (cargo.anulado) {
        throw new BadRequestException('El cargo ya está anulado');
      }

      await tx.cargo.update({
        where: { id: cargoId },
        data: { anulado: true, motivoAnulacion: motivo },
      });
      await tx.eventoReserva.create({
        data: {
          reservaId,
          tipo: 'cargo_anulado',
          usuarioId: quien.id,
          detalle: `${cargo.concepto} (${dinero(cargo.total)}) · ${motivo}`,
        },
      });
    });
    return this.folio(hotelId, reservaId);
  }
}
