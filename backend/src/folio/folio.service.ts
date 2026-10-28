import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MedioPago, Prisma, Reserva, TipoPago } from '@prisma/client';
import { ContextoHotel, UsuarioAutenticado } from '../auth/decoradores';
import { PrismaService } from '../prisma/prisma.service';
import { Reloj } from '../hotel/reloj';
import { contarNoches, fechaDelHotel, sumarDias } from '../hotel/politicas';
import { Desglose, recortarDesglose } from '../tarifas/motor-tarificacion';
import { AgregarCargoDto, RegistrarPagoDto } from './folio.dto';
import { calcularSaldo, loQueSeDebe } from './estado-de-cuenta';
import { ServiciosService } from '../servicios/servicios.service';
import { DatosDePrecioError, precioDelServicio } from '../servicios/precio-servicio';

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

// A-1: pagos de la reserva para el cálculo del saldo (en pesos).
export async function pagosDeCuenta(tx: Transaccion | PrismaService, reservaId: string) {
  const pagos = await tx.pago.findMany({
    where: { reservaId },
    select: { tipo: true, monto: true, anulado: true },
  });
  return pagos.map((p) => ({ tipo: p.tipo, monto: p.monto.toNumber(), anulado: p.anulado }));
}

// A-2: anticipos vigentes de varias reservas, en una sola consulta.
export async function anticiposVigentes(prisma: PrismaService, reservaIds: string[]) {
  const grupos = await prisma.pago.groupBy({
    by: ['reservaId'],
    where: { reservaId: { in: reservaIds }, tipo: 'anticipo', anulado: false },
    _sum: { monto: true },
  });
  return new Map(grupos.map((g) => [g.reservaId, g._sum.monto?.toNumber() ?? 0]));
}

// A-1: saldo de una reserva = lo que se debe − pagos + reembolsos (nunca se
// guarda). Con `debe` se usa ese monto (p. ej. la liquidación del check-out).
export async function saldoDe(tx: Transaccion | PrismaService, reserva: Reserva, debe?: number) {
  const cargos =
    reserva.total === null && debe === undefined ? await totalCargos(tx, reserva.id) : null;
  return calcularSaldo({
    debe:
      debe ??
      loQueSeDebe({
        total: reserva.total?.toNumber() ?? null,
        valorAlojamiento: reserva.valorAlojamiento.toNumber(),
        cargos: cargos?.toNumber() ?? 0,
      }),
    pagos: await pagosDeCuenta(tx, reserva.id),
  });
}

const ETIQUETA_TIPO_PAGO: Record<TipoPago, string> = {
  abono: 'Abono',
  anticipo: 'Anticipo',
  reembolso: 'Reembolso',
};

// Cómo queda un pago en la auditoría: "Abono $50.000 · tarjeta · ref. 1234".
export const detallePago = (p: {
  tipo: TipoPago;
  medio: MedioPago;
  monto: Prisma.Decimal | number;
  referencia?: string | null;
}) =>
  [
    `${ETIQUETA_TIPO_PAGO[p.tipo]} ${dinero(p.monto)}`,
    p.medio,
    p.referencia && `ref. ${p.referencia}`,
  ]
    .filter(Boolean)
    .join(' · ');

// R23: solo los medios de pago que el hotel recibe.
export function exigirMedioDelHotel(hotel: ContextoHotel, medio: MedioPago) {
  if (!hotel.politicas.mediosPago.includes(medio)) {
    throw new BadRequestException(`El hotel no recibe pagos por ${medio}`);
  }
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
    private readonly servicios: ServiciosService,
  ) {}

  // A-1: estado de cuenta del folio: lo que se debe, lo pagado y el saldo, con
  // los cargos y los pagos (vigentes y anulados) en orden de fecha.
  async folio(hotelId: string, reservaId: string) {
    const reserva = await this.prisma.reserva.findFirst({
      where: { id: reservaId, hotelId },
      include: {
        cargos: {
          include: { usuario: { select: { nombre: true } } },
          orderBy: { fecha: 'asc' },
        },
        pagos: {
          include: {
            usuario: { select: { nombre: true } },
            anuladoPor: { select: { nombre: true } },
          },
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
    const pagos = reserva.pagos.map((p) => ({
      tipo: p.tipo,
      monto: p.monto.toNumber(),
      anulado: p.anulado,
    }));
    const cuenta = calcularSaldo({
      debe: loQueSeDebe({
        total: reserva.total?.toNumber() ?? null,
        valorAlojamiento: reserva.valorAlojamiento.toNumber(),
        cargos: consumos.toNumber(),
      }),
      pagos,
    });

    // Con la estadía activa se anticipa cómo quedaría el check-out si fuera
    // ahora: si el huésped se va antes, se cobran solo las noches usadas (R24).
    const liquidacion =
      reserva.estado === 'activa' ? liquidarAlojamiento(reserva, this.reloj.ahora()) : null;
    const totalACobrar = liquidacion?.alojamiento.add(consumos);

    return {
      reservaId: reserva.id,
      estado: reserva.estado,
      alojamiento: reserva.valorAlojamiento,
      consumos,
      total: reserva.total ?? reserva.valorAlojamiento.add(consumos),
      // S-1: quiénes se alojan, para precargar un servicio por persona o por edad.
      huespedes: { adultos: reserva.adultos, edadesNinos: reserva.edadesNinos },
      // A-2: el anticipo sugerido pactado al reservar (null en reservas anteriores).
      anticipoSugerido: reserva.anticipoSugerido,
      ...cuenta,
      salidaAnticipada: liquidacion?.anticipada
        ? {
            nochesPactadas: liquidacion.nochesPactadas,
            nochesACobrar: liquidacion.nochesUsadas,
            alojamientoACobrar: liquidacion.alojamiento,
            totalACobrar,
            saldoACobrar: calcularSaldo({ debe: totalACobrar!.toNumber(), pagos }).saldo,
          }
        : null,
      cargos: reserva.cargos,
      pagos: reserva.pagos,
      // Cargos y pagos en una sola línea de tiempo.
      movimientos: [
        ...reserva.cargos.map((c) => ({ clase: 'cargo' as const, fecha: c.fecha, registro: c })),
        ...reserva.pagos.map((p) => ({ clase: 'pago' as const, fecha: p.fecha, registro: p })),
      ].sort((a, b) => a.fecha.getTime() - b.fecha.getTime()),
    };
  }

  // A-1: abono durante la estadía (o del saldo pendiente después del cierre)
  // y reembolso de un saldo a favor. El bloqueo de la reserva lo ordena con
  // los cargos y el check-out: el saldo siempre cuadra.
  async registrarPago(
    hotel: ContextoHotel,
    reservaId: string,
    dto: RegistrarPagoDto,
    quien: UsuarioAutenticado,
  ) {
    exigirMedioDelHotel(hotel, dto.medio);
    const tipo = dto.tipo ?? 'abono';

    await this.prisma.$transaction(async (tx) => {
      const reserva = await bloquearReserva(tx, hotel.id, reservaId);
      // A-2: antes de llegar se paga un anticipo; después, abonos.
      if (reserva.estado === 'confirmada' && tipo === 'abono') {
        throw new BadRequestException('Antes del check-in el pago es un anticipo, no un abono');
      }
      if (reserva.estado !== 'confirmada' && tipo === 'anticipo') {
        throw new BadRequestException(
          'El anticipo es antes de llegar: con la estadía en curso o terminada, registra un abono',
        );
      }
      const { saldo } = await saldoDe(tx, reserva);
      if (tipo === 'reembolso') {
        if (saldo >= 0) {
          throw new BadRequestException('No hay saldo a favor del huésped para reembolsar');
        }
        if (dto.monto > -saldo) {
          throw new BadRequestException(`El reembolso supera el saldo a favor (${dinero(-saldo)})`);
        }
      } else if (reserva.estado !== 'activa' && reserva.estado !== 'confirmada') {
        // Cerrada, cancelada o no-show: solo se abona lo que quedó pendiente.
        if (saldo <= 0) {
          throw new ConflictException('La cuenta de esta reserva ya está saldada');
        }
        if (dto.monto > saldo) {
          throw new BadRequestException(`El abono supera el saldo pendiente (${dinero(saldo)})`);
        }
      }

      const datos = { tipo, medio: dto.medio, monto: dto.monto, referencia: dto.referencia };
      await tx.pago.create({
        data: {
          ...datos,
          hotelId: hotel.id,
          reservaId,
          usuarioId: quien.id,
          fecha: this.reloj.ahora(),
        },
      });
      await tx.eventoReserva.create({
        data: {
          reservaId,
          tipo: 'pago_registrado',
          usuarioId: quien.id,
          detalle: detallePago(datos),
          fecha: this.reloj.ahora(),
        },
      });
    });
    return this.folio(hotel.id, reservaId);
  }

  // A-1: un pago no se borra: se anula con motivo (solo quien tiene el permiso).
  async anularPago(
    hotelId: string,
    reservaId: string,
    pagoId: string,
    motivo: string,
    quien: UsuarioAutenticado,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await bloquearReserva(tx, hotelId, reservaId);
      const pago = await tx.pago.findFirst({ where: { id: pagoId, reservaId } });
      if (!pago) {
        throw new NotFoundException('Pago no encontrado en este folio');
      }
      if (pago.anulado) {
        throw new BadRequestException('El pago ya está anulado');
      }
      await tx.pago.update({
        where: { id: pagoId },
        data: { anulado: true, motivoAnulacion: motivo, anuladoPorId: quien.id },
      });
      await tx.eventoReserva.create({
        data: {
          reservaId,
          tipo: 'pago_anulado',
          usuarioId: quien.id,
          detalle: `${detallePago(pago)} · ${motivo}`,
          fecha: this.reloj.ahora(),
        },
      });
    });
    return this.folio(hotelId, reservaId);
  }

  // A-1: reservas terminadas que aún deben (cerradas con saldo, penalidades
  // sin pagar), con su saldo, de la más reciente a la más antigua.
  async cuentasPorCobrar(hotelId: string) {
    return (await this.cuentasTerminadas(hotelId)).filter((c) => c.saldo > 0);
  }

  // A-2: reservas terminadas con saldo a favor del huésped (p. ej. el anticipo
  // de una cancelación gratuita o el excedente de un no-show): lo que se le devuelve.
  async saldosAFavor(hotelId: string) {
    return (await this.cuentasTerminadas(hotelId)).filter((c) => c.saldo < 0);
  }

  // Reservas terminadas (cerradas, canceladas, no-show) con su saldo.
  private async cuentasTerminadas(hotelId: string) {
    const reservas = await this.prisma.reserva.findMany({
      where: { hotelId, estado: { in: ['cerrada', 'cancelada', 'no_show'] } },
      include: {
        habitacion: { select: { numero: true } },
        huesped: { select: { nombre: true, tipoDocumento: true, documento: true } },
        pagos: { select: { tipo: true, monto: true, anulado: true } },
      },
      orderBy: { fechaSalida: 'desc' },
    });
    return reservas.map(({ pagos, ...r }) => ({
      reservaId: r.id,
      estado: r.estado,
      habitacion: r.habitacion.numero,
      huesped: r.huesped,
      fechaEntrada: r.fechaEntrada,
      fechaSalida: r.fechaSalida,
      ...calcularSaldo({
        debe: r.total?.toNumber() ?? 0,
        pagos: pagos.map((p) => ({ ...p, monto: p.monto.toNumber() })),
      }),
    }));
  }

  async agregarCargo(
    hotel: ContextoHotel,
    reservaId: string,
    dto: AgregarCargoDto,
    quien: UsuarioAutenticado,
  ) {
    const hotelId = hotel.id;
    const consumo = dto.servicioId
      ? await this.consumoDelCatalogo(hotel, dto.servicioId, dto)
      : {
          categoria: dto.categoria!,
          concepto: dto.concepto!,
          cantidad: dto.cantidad!,
          valorUnitario: new Prisma.Decimal(dto.valorUnitario!),
        };

    await this.prisma.$transaction(async (tx) => {
      const reserva = await bloquearReserva(tx, hotelId, reservaId);
      exigirEstadiaActiva(reserva.estado);

      const total = consumo.valorUnitario.mul(consumo.cantidad);
      await tx.cargo.create({
        // La hora sale del reloj del hotel, como la de los pagos y los eventos.
        data: {
          ...consumo,
          reservaId,
          total,
          usuarioId: quien.id,
          fecha: this.reloj.ahora(),
        },
      });
      await tx.eventoReserva.create({
        data: {
          reservaId,
          tipo: 'cargo_agregado',
          usuarioId: quien.id,
          fecha: this.reloj.ahora(),
          detalle: `${consumo.concepto} × ${consumo.cantidad} · ${dinero(total)}`,
        },
      });
    });
    return this.folio(hotelId, reservaId);
  }

  // Del catálogo se copian el concepto, la clasificación y el precio vigentes
  // (R22): si el hotel cambia el servicio después, el cargo no cambia. Por
  // persona o por edad, el total sale de quiénes lo toman (R55), con los rangos
  // de edad vigentes del hotel.
  private async consumoDelCatalogo(hotel: ContextoHotel, servicioId: string, dto: AgregarCargoDto) {
    const servicio = await this.servicios.paraCargar(hotel.id, servicioId);
    try {
      const precio = precioDelServicio(
        {
          nombre: servicio.nombre,
          modoPrecio: servicio.modoPrecio,
          precio: servicio.precio.toNumber(),
          precioNino: servicio.precioNino?.toNumber() ?? null,
        },
        dto,
        {
          gratisHasta: hotel.politicas.edadMaximaNinoGratis,
          ninoHasta: hotel.politicas.edadMaximaNino,
        },
      );
      return {
        servicioId: servicio.id,
        categoria: servicio.categoria.clasificacion,
        concepto: precio.concepto,
        cantidad: precio.cantidad,
        valorUnitario: new Prisma.Decimal(precio.valorUnitario),
      };
    } catch (error) {
      if (error instanceof DatosDePrecioError) throw new BadRequestException(error.message);
      throw error;
    }
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
          fecha: this.reloj.ahora(),
          detalle: `${cargo.concepto} (${dinero(cargo.total)}) · ${motivo}`,
        },
      });
    });
    return this.folio(hotelId, reservaId);
  }
}
