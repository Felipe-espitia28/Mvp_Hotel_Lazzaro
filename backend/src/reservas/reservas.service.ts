import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma, Reserva, TipoEventoReserva } from '@prisma/client';
import { UsuarioAutenticado } from '../auth/decoradores';
import { PrismaService } from '../prisma/prisma.service';
import { Reloj } from '../hotel/reloj';
import {
  POLITICAS,
  contarNoches,
  fechaDelHotel,
  limiteCancelacionGratuita,
  limiteNoShow,
  sumarDias,
} from '../hotel/politicas';
import { CrearReservaDto } from './dto/crear-reserva.dto';
import { HuespedesService } from '../huespedes/huespedes.service';

// Fragmento del error de PostgreSQL para violación de una restricción EXCLUDE
// (código 23P01: la que impide dos reservas solapadas sobre la misma habitación),
// tal como aparece dentro del mensaje que arma Prisma.
const ERROR_POSTGRES_EXCLUSION = 'code: "23P01"';

// Prisma no modela la restricción EXCLUDE (no está en el schema), así que la
// reporta como PrismaClientUnknownRequestError con el error crudo de PostgreSQL
// dentro del mensaje. OJO: ese mensaje también incluye líneas del código fuente
// alrededor de la llamada (comentarios incluidos), por eso se busca el fragmento
// exacto del error de Postgres y no solo "23P01" suelto.
export function esViolacionDeNoSobreventa(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientUnknownRequestError &&
    error.message.includes(ERROR_POSTGRES_EXCLUSION)
  );
}

// Penalidad de cancelación tardía / no-show (R9, R10): el valor de una noche.
// Mientras la tarifa sea fija todas las noches valen lo mismo; con tarifas por
// temporada (bloque B) se tomará el precio real de la primera noche.
export function calcularPenalidad(reserva: Reserva) {
  const noches = contarNoches(reserva.fechaEntrada, reserva.fechaSalida);
  const nochesCobradas = Math.min(POLITICAS.nochesPenalidad, noches);
  return reserva.valorAlojamiento.div(noches).mul(nochesCobradas).toDecimalPlaces(2);
}

// Agrega a la respuesta datos derivados que el frontend necesita mostrar.
function presentar<T extends Reserva>(reserva: T) {
  return {
    ...reserva,
    noches: contarNoches(reserva.fechaEntrada, reserva.fechaSalida),
    cancelacionGratuitaHasta: limiteCancelacionGratuita(reserva.fechaEntrada),
  };
}

const formatoFecha = (fecha: Date) => fecha.toISOString().slice(0, 10);

// Montos en el detalle de la auditoría, en formato colombiano ($80.000).
const dinero = (valor: Prisma.Decimal) => `$${valor.toNumber().toLocaleString('es-CO')}`;

const CON_DETALLE = { habitacion: true, huesped: true } as const;

@Injectable()
export class ReservasService {
  private readonly logger = new Logger(ReservasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reloj: Reloj,
    private readonly huespedes: HuespedesService,
  ) {}

  async listar() {
    const reservas = await this.prisma.reserva.findMany({
      include: CON_DETALLE,
      orderBy: { createdAt: 'desc' },
    });
    return reservas.map(presentar);
  }

  async crear(dto: CrearReservaDto, quien: UsuarioAutenticado) {
    // Solo importa el día de calendario, aunque llegue con hora.
    const fechaEntrada = new Date(dto.fechaEntrada.slice(0, 10));
    const fechaSalida = new Date(dto.fechaSalida.slice(0, 10));
    this.validarFechas(fechaEntrada, fechaSalida);

    const habitacion = await this.prisma.habitacion.findUnique({
      where: { id: dto.habitacionId },
    });
    if (!habitacion) {
      throw new NotFoundException('Habitación no encontrada');
    }

    // 1. Validación previa: da una respuesta 409 limpia en el caso común.
    //    No es la garantía real (ver punto 2), pero evita un viaje extra a la BD
    //    cuando el solapamiento es evidente.
    const seSolapa = await this.prisma.reserva.findFirst({
      where: {
        habitacionId: dto.habitacionId,
        estado: { in: ['confirmada', 'activa'] },
        fechaEntrada: { lt: fechaSalida },
        fechaSalida: { gt: fechaEntrada },
      },
    });
    if (seSolapa) {
      throw new ConflictException(
        'La habitación ya tiene una reserva que se solapa con esas fechas',
      );
    }

    // R5: el precio se calcula y se congela ahora; el check-out cobra este valor
    // aunque la tarifa de la habitación cambie después.
    const valorAlojamiento = habitacion.tarifaNoche.mul(contarNoches(fechaEntrada, fechaSalida));

    // Un cliente que vuelve se reconoce por su documento (no se duplica).
    const huesped = await this.huespedes.obtenerOCrear(dto.huesped);

    // 2. Garantía real: la restricción EXCLUDE de PostgreSQL (migración
    //    reserva_sin_sobreventa) rechaza de forma atómica cualquier solapamiento,
    //    incluso si dos peticiones llegan al mismo tiempo. Si ocurre, lo
    //    traducimos a 409 en el catch de abajo.
    try {
      const reserva = await this.prisma.reserva.create({
        data: {
          habitacion: { connect: { id: dto.habitacionId } },
          fechaEntrada,
          fechaSalida,
          valorAlojamiento,
          huesped: { connect: { id: huesped.id } },
          eventos: { create: { tipo: 'creada', usuarioId: quien.id } },
        },
        include: CON_DETALLE,
      });
      return presentar(reserva);
    } catch (error) {
      if (esViolacionDeNoSobreventa(error)) {
        throw new ConflictException(
          'La habitación ya tiene una reserva que se solapa con esas fechas',
        );
      }
      throw error;
    }
  }

  // R2, R3 y R4: rango válido, no en el pasado, estadía y antelación máximas.
  private validarFechas(fechaEntrada: Date, fechaSalida: Date) {
    if (fechaSalida <= fechaEntrada) {
      throw new BadRequestException('La fecha de salida debe ser posterior a la fecha de entrada');
    }

    const hoy = fechaDelHotel(this.reloj.ahora());
    if (fechaEntrada < hoy) {
      throw new BadRequestException('La fecha de entrada no puede estar en el pasado');
    }
    if (fechaEntrada > sumarDias(hoy, POLITICAS.antelacionMaximaDias)) {
      throw new BadRequestException(
        `Solo se puede reservar con hasta ${POLITICAS.antelacionMaximaDias} días de antelación`,
      );
    }
    if (contarNoches(fechaEntrada, fechaSalida) > POLITICAS.estadiaMaximaNoches) {
      throw new BadRequestException(
        `La estadía máxima es de ${POLITICAS.estadiaMaximaNoches} noches`,
      );
    }
  }

  private async buscar(id: string) {
    const reserva = await this.prisma.reserva.findUnique({ where: { id } });
    if (!reserva) {
      throw new NotFoundException('Reserva no encontrada');
    }
    return reserva;
  }

  async checkIn(id: string, quien: UsuarioAutenticado) {
    const reserva = await this.buscar(id);
    if (reserva.estado !== 'confirmada') {
      throw new BadRequestException(
        `No se puede hacer check-in de una reserva en estado "${reserva.estado}"`,
      );
    }

    // El huésped puede llegar desde su fecha de entrada y hasta el límite de no-show.
    const ahora = this.reloj.ahora();
    if (fechaDelHotel(ahora) < reserva.fechaEntrada) {
      throw new BadRequestException(
        `El check-in se puede hacer a partir del ${formatoFecha(reserva.fechaEntrada)}`,
      );
    }
    if (ahora >= limiteNoShow(reserva.fechaEntrada)) {
      throw new BadRequestException('La reserva venció: el huésped no llegó a tiempo (no-show)');
    }

    // La habitación se actualiza primero para que el "include" de la reserva,
    // dentro de la misma transacción, devuelva ya su estado final.
    const [, reservaActualizada] = await this.prisma.$transaction([
      this.prisma.habitacion.update({
        where: { id: reserva.habitacionId },
        data: { estado: 'ocupada' },
      }),
      this.prisma.reserva.update({
        where: { id },
        data: { estado: 'activa' },
        include: CON_DETALLE,
      }),
      this.registrar(id, 'check_in', quien),
    ]);

    return presentar(reservaActualizada);
  }

  async checkOut(id: string, quien: UsuarioAutenticado) {
    const reserva = await this.buscar(id);
    if (reserva.estado !== 'activa') {
      throw new BadRequestException(
        `No se puede hacer check-out de una reserva en estado "${reserva.estado}"`,
      );
    }

    // R5: se cobra el precio pactado al reservar, no la tarifa vigente hoy.
    const [, reservaActualizada] = await this.prisma.$transaction([
      this.prisma.habitacion.update({
        where: { id: reserva.habitacionId },
        data: { estado: 'libre' },
      }),
      this.prisma.reserva.update({
        where: { id },
        data: { estado: 'cerrada', total: reserva.valorAlojamiento },
        include: CON_DETALLE,
      }),
      this.registrar(id, 'check_out', quien, `Total ${dinero(reserva.valorAlojamiento)}`),
    ]);

    return presentar(reservaActualizada);
  }

  // R8, R9, R11: solo se cancela antes del check-in; gratis hasta 48 h antes,
  // después se cobra una noche. Las fechas quedan libres de inmediato.
  async cancelar(id: string, quien: UsuarioAutenticado) {
    const reserva = await this.buscar(id);
    if (reserva.estado !== 'confirmada') {
      throw new BadRequestException(
        `No se puede cancelar una reserva en estado "${reserva.estado}"`,
      );
    }

    const esGratuita = this.reloj.ahora() <= limiteCancelacionGratuita(reserva.fechaEntrada);
    const penalidad = esGratuita ? null : calcularPenalidad(reserva);
    const reservaCancelada = await this.prisma.reserva.update({
      where: { id },
      data: {
        estado: 'cancelada',
        total: penalidad ?? 0,
        eventos: {
          create: {
            tipo: 'cancelada',
            usuarioId: quien.id,
            detalle: penalidad ? `Penalidad ${dinero(penalidad)}` : 'Sin costo',
          },
        },
      },
      include: CON_DETALLE,
    });

    return presentar(reservaCancelada);
  }

  // R10: marca como no-show las reservas confirmadas cuyo huésped no llegó a
  // tiempo, les asigna la penalidad y libera sus noches. Corre solo cada 10
  // minutos; también se expone por API para poder forzarlo.
  @Cron(CronExpression.EVERY_10_MINUTES)
  async procesarNoShows() {
    const ahora = this.reloj.ahora();
    // Candidatas: entraban ayer o antes (el límite cae al día siguiente de la entrada).
    const candidatas = await this.prisma.reserva.findMany({
      where: { estado: 'confirmada', fechaEntrada: { lt: fechaDelHotel(ahora) } },
    });
    const vencidas = candidatas.filter((r) => ahora >= limiteNoShow(r.fechaEntrada));

    const marcadas: string[] = [];
    for (const reserva of vencidas) {
      const penalidad = calcularPenalidad(reserva);
      await this.prisma.$transaction(async (tx) => {
        // El filtro por estado evita pisar un check-in que ocurra justo ahora;
        // solo si de verdad cambió se registra el evento (usuario null = sistema).
        const { count } = await tx.reserva.updateMany({
          where: { id: reserva.id, estado: 'confirmada' },
          data: { estado: 'no_show', total: penalidad },
        });
        if (count === 1) {
          await tx.eventoReserva.create({
            data: {
              reservaId: reserva.id,
              tipo: 'no_show',
              detalle: `Penalidad ${dinero(penalidad)}`,
            },
          });
          marcadas.push(reserva.id);
        }
      });
    }
    if (marcadas.length > 0) {
      this.logger.log(`${marcadas.length} reserva(s) marcadas como no-show`);
    }

    return { marcadas };
  }

  // R34: historial de la reserva, del evento más antiguo al más reciente.
  async historial(id: string) {
    await this.buscar(id);
    return this.prisma.eventoReserva.findMany({
      where: { reservaId: id },
      include: { usuario: { select: { nombre: true, rol: true } } },
      orderBy: { fecha: 'asc' },
    });
  }

  private registrar(
    reservaId: string,
    tipo: TipoEventoReserva,
    quien: UsuarioAutenticado,
    detalle?: string,
  ) {
    return this.prisma.eventoReserva.create({
      data: { reservaId, tipo, usuarioId: quien.id, detalle },
    });
  }
}
