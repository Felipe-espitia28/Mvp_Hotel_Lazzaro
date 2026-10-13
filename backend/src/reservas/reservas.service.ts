import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EstadoHabitacion, MedioPago, Prisma, Reserva } from '@prisma/client';
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
import { ListarReservasDto, POR_PAGINA_POR_DEFECTO } from './dto/listar-reservas.dto';
import { RegistroCheckInDto } from './dto/registro-check-in.dto';
import { normalizarDocumento } from '../huespedes/documento';
import { HuespedesService } from '../huespedes/huespedes.service';
import {
  CapacidadExcedidaError,
  Desglose,
  cotizar,
  valorPrimeraNoche,
} from '../tarifas/motor-tarificacion';
import { condicionesDe } from '../tarifas/tarifas.service';
import { bloquearReserva, dinero, liquidarAlojamiento, totalCargos } from '../folio/folio.service';

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

// Penalidad de cancelación tardía / no-show (R9, R10): el valor de la primera
// noche según el desglose congelado (con su temporada, adicionales e IVA).
// Las reservas anteriores al motor de tarifas no tienen desglose: se usa el
// promedio por noche, que en esas reservas de tarifa fija es lo mismo.
export function calcularPenalidad(reserva: Reserva) {
  if (reserva.desglose) {
    return new Prisma.Decimal(valorPrimeraNoche(reserva.desglose as unknown as Desglose));
  }
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

const CON_DETALLE = { habitacion: true, huesped: true } as const;

// Por qué una habitación no se puede entregar en este momento (R25, R26).
const MOTIVO_NO_DISPONIBLE: Record<EstadoHabitacion, (numero: string) => string> = {
  libre: (n) => `La habitación ${n} está libre`,
  ocupada: (n) => `La habitación ${n} todavía está ocupada por otro huésped`,
  en_limpieza: (n) => `La habitación ${n} está en limpieza: márcala lista antes del check-in`,
  fuera_servicio: (n) => `La habitación ${n} está fuera de servicio`,
};

@Injectable()
export class ReservasService {
  private readonly logger = new Logger(ReservasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reloj: Reloj,
    private readonly huespedes: HuespedesService,
  ) {}

  // Listado paginado (un hotel acumula miles de reservas en un año), de la
  // más reciente a la más antigua, con filtro por estado y búsqueda.
  async listar(filtros: ListarReservasDto = {}) {
    const pagina = filtros.pagina ?? 1;
    const porPagina = filtros.porPagina ?? POR_PAGINA_POR_DEFECTO;
    const texto = filtros.buscar?.trim();

    const where: Prisma.ReservaWhereInput = {
      ...(filtros.estado && { estado: filtros.estado }),
      ...(texto && {
        OR: [
          { huesped: { nombre: { contains: texto, mode: 'insensitive' } } },
          { huesped: { documento: { startsWith: normalizarDocumento(texto) } } },
          { habitacion: { numero: texto } },
        ],
      }),
    };

    const [reservas, total] = await this.prisma.$transaction([
      this.prisma.reserva.findMany({
        where,
        include: CON_DETALLE,
        orderBy: { createdAt: 'desc' },
        skip: (pagina - 1) * porPagina,
        take: porPagina,
      }),
      this.prisma.reserva.count({ where }),
    ]);

    return {
      datos: reservas.map(presentar),
      total,
      pagina,
      porPagina,
      paginas: Math.max(1, Math.ceil(total / porPagina)),
    };
  }

  async crear(dto: CrearReservaDto, quien: UsuarioAutenticado) {
    // Solo importa el día de calendario, aunque llegue con hora.
    const fechaEntrada = new Date(dto.fechaEntrada.slice(0, 10));
    const fechaSalida = new Date(dto.fechaSalida.slice(0, 10));
    this.validarFechas(fechaEntrada, fechaSalida);

    const habitacion = await this.prisma.habitacion.findUnique({
      where: { id: dto.habitacionId },
      include: { tipoHabitacion: true },
    });
    if (!habitacion) {
      throw new NotFoundException('Habitación no encontrada');
    }
    if (habitacion.estado === 'fuera_servicio') {
      throw new BadRequestException(MOTIVO_NO_DISPONIBLE.fuera_servicio(habitacion.numero));
    }

    // R5, R12–R17: el precio se calcula noche por noche y se congela ahora; el
    // check-out cobra este valor aunque las tarifas cambien después.
    // R16 (⚖️): exento de IVA el huésped extranjero no residente (pasaporte).
    const numeroHuespedes = dto.numeroHuespedes ?? 1;
    let desglose: Desglose;
    try {
      desglose = cotizar(
        condicionesDe(habitacion.tipoHabitacion),
        fechaEntrada,
        fechaSalida,
        numeroHuespedes,
        dto.huesped.tipoDocumento === 'PASAPORTE',
      );
    } catch (error) {
      if (error instanceof CapacidadExcedidaError) {
        throw new BadRequestException(`${error.message} (habitación ${habitacion.numero})`);
      }
      throw error;
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
          numeroHuespedes,
          valorAlojamiento: desglose.total,
          desglose: desglose as unknown as Prisma.InputJsonObject,
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

  async checkIn(id: string, registro: RegistroCheckInDto, quien: UsuarioAutenticado) {
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

    const reservaActualizada = await this.prisma.$transaction(async (tx) => {
      // R25: solo se entrega una habitación lista. La actualización condicionada
      // ("solo si está libre") también evita dos check-in simultáneos en ella.
      const { count } = await tx.habitacion.updateMany({
        where: { id: reserva.habitacionId, estado: 'libre' },
        data: { estado: 'ocupada' },
      });
      if (count === 0) {
        const habitacion = await tx.habitacion.findUniqueOrThrow({
          where: { id: reserva.habitacionId },
        });
        throw new BadRequestException(MOTIVO_NO_DISPONIBLE[habitacion.estado](habitacion.numero));
      }

      // R19: la nacionalidad es del huésped (se conserva para la próxima
      // visita); la procedencia y el motivo son de esta estadía.
      await tx.huesped.update({
        where: { id: reserva.huespedId },
        data: { nacionalidad: registro.nacionalidad },
      });
      await tx.eventoReserva.create({
        data: { reservaId: id, tipo: 'check_in', usuarioId: quien.id },
      });
      return tx.reserva.update({
        where: { id },
        data: {
          estado: 'activa',
          procedencia: registro.procedencia,
          motivoViaje: registro.motivoViaje,
        },
        include: CON_DETALLE,
      });
    });

    return presentar(reservaActualizada);
  }

  // R23: el check-out liquida y cierra el folio: alojamiento pactado (R5) +
  // consumos vigentes, pagado completo con el medio indicado. Después del
  // cierre el folio no admite más cargos (R21).
  async checkOut(id: string, medioPago: MedioPago, quien: UsuarioAutenticado) {
    const reservaCerrada = await this.prisma.$transaction(async (tx) => {
      // El bloqueo evita que un cargo concurrente quede fuera de la liquidación.
      const reserva = await bloquearReserva(tx, id);
      if (reserva.estado !== 'activa') {
        throw new BadRequestException(
          `No se puede hacer check-out de una reserva en estado "${reserva.estado}"`,
        );
      }

      // R24: si se va antes de lo pactado, se cobran solo las noches usadas.
      const liquidacion = liquidarAlojamiento(reserva, this.reloj.ahora());
      const consumos = await totalCargos(tx, id);
      const total = liquidacion.alojamiento.add(consumos);

      // R25: la habitación queda en limpieza hasta que la marquen lista.
      await tx.habitacion.update({
        where: { id: reserva.habitacionId },
        data: { estado: 'en_limpieza' },
      });

      const partes = [
        consumos.isZero()
          ? `Total ${dinero(total)}`
          : `Total ${dinero(total)} (alojamiento ${dinero(liquidacion.alojamiento)} + consumos ${dinero(consumos)})`,
      ];
      if (liquidacion.anticipada) {
        partes.push(
          `salida anticipada: ${liquidacion.nochesUsadas} de ${liquidacion.nochesPactadas} noches (pactado ${dinero(reserva.valorAlojamiento)})`,
        );
      }
      partes.push(medioPago);
      await tx.eventoReserva.create({
        data: {
          reservaId: id,
          tipo: 'check_out',
          usuarioId: quien.id,
          detalle: partes.join(' · '),
        },
      });

      // En una salida anticipada la reserva queda con las noches y el valor
      // realmente usados; las noches restantes quedan libres para vender.
      return tx.reserva.update({
        where: { id },
        data: {
          estado: 'cerrada',
          total,
          medioPago,
          ...(liquidacion.anticipada && {
            fechaSalida: liquidacion.fechaSalida,
            valorAlojamiento: liquidacion.alojamiento,
            desglose: liquidacion.desglose
              ? (liquidacion.desglose as unknown as Prisma.InputJsonObject)
              : Prisma.DbNull,
          }),
        },
        include: CON_DETALLE,
      });
    });

    return presentar(reservaCerrada);
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

  // R19: registro hotelero de un día: los huéspedes que hicieron check-in con
  // esa fecha de llegada, con los datos que piden la Tarjeta de Registro
  // Hotelero y, para extranjeros, el reporte a Migración.
  async registroHotelero(fecha?: string) {
    const dia = fecha ? new Date(fecha.slice(0, 10)) : fechaDelHotel(this.reloj.ahora());
    const reservas = await this.prisma.reserva.findMany({
      where: { fechaEntrada: dia, estado: { in: ['activa', 'cerrada'] } },
      include: CON_DETALLE,
      orderBy: { habitacion: { numero: 'asc' } },
    });

    return {
      fecha: dia,
      registros: reservas.map((r) => ({
        reservaId: r.id,
        habitacion: r.habitacion.numero,
        nombre: r.huesped.nombre,
        tipoDocumento: r.huesped.tipoDocumento,
        documento: r.huesped.documento,
        nacionalidad: r.huesped.nacionalidad,
        procedencia: r.procedencia,
        motivoViaje: r.motivoViaje,
        numeroHuespedes: r.numeroHuespedes,
        fechaEntrada: r.fechaEntrada,
        fechaSalida: r.fechaSalida,
        // Los extranjeros se reportan además a Migración Colombia.
        extranjero: r.huesped.nacionalidad !== null && r.huesped.nacionalidad !== 'CO',
      })),
    };
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
}
