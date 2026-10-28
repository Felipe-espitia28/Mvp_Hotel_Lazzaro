import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CategoriaCargo, EstadoCita, MedioPago, Prisma, Reserva, Servicio } from '@prisma/client';
import { ContextoHotel, UsuarioAutenticado } from '../auth/decoradores';
import { PrismaService } from '../prisma/prisma.service';
import { Reloj } from '../hotel/reloj';
import { fechaDelHotel, sumarDias } from '../hotel/politicas';
import { HuespedesService } from '../huespedes/huespedes.service';
import { titularDeReserva } from '../reservas/dto/crear-reserva.dto';
import { esViolacionDeNoSobreventa } from '../reservas/reservas.service';
import {
  anularCargoEn,
  bloquearReserva,
  dinero,
  exigirMedioDelHotel,
  registrarCargo,
} from '../folio/folio.service';
import { calcularSaldo } from '../folio/estado-de-cuenta';
import { turnoAbiertoDe } from '../caja/turno-abierto';
import { DatosDePrecioError, precioDelServicio } from '../servicios/precio-servicio';
import {
  ActualizarRecursoDto,
  AgendarCitaDto,
  CambiarEstadoCitaDto,
  CambiarEstadoSalidaDto,
  CrearRecursoDto,
  CrearSalidaDto,
  PagoInmediatoDto,
  TomarCupoDto,
} from './agenda.dto';
import {
  Disponibilidad,
  dentroDelHorario,
  horaDelHotel,
  huecosLibres,
  instanteDelDia,
  sumarMinutos,
} from './huecos';

type Tx = Prisma.TransactionClient;

const MS_HORA = 60 * 60 * 1000;
const DIAS_SALIDAS_POR_DEFECTO = 14;
// Las citas que ocupan su recurso (las mismas de la restricción cita_sin_cruce).
const CITAS_VIGENTES: EstadoCita[] = ['agendada', 'en_curso'];
const MENSAJE_CRUCE = 'El recurso ya tiene una cita que se cruza con ese horario';

// Con inserciones simultáneas de rangos que se cruzan sin ser iguales,
// PostgreSQL puede resolver la carrera de la restricción EXCLUDE como un
// interbloqueo (40P01) en lugar de 23P01: igual entra solo una. Para quien
// agenda es el mismo caso: el hueco ya no está libre.
const esInterbloqueo = (error: unknown) =>
  error instanceof Prisma.PrismaClientUnknownRequestError &&
  error.message.includes('code: "40P01"');

// S-2: agendada → en_curso → realizada; o cancelada / no_asistio. Recepción
// puede marcar realizada sin pasar por "en curso".
const TRANSICIONES: Record<EstadoCita, EstadoCita[]> = {
  agendada: ['en_curso', 'realizada', 'cancelada', 'no_asistio'],
  en_curso: ['realizada', 'cancelada'],
  realizada: [],
  cancelada: [],
  no_asistio: [],
};

const ETIQUETA_CITA: Record<EstadoCita, string> = {
  agendada: 'agendada',
  en_curso: 'en curso',
  realizada: 'realizada',
  cancelada: 'cancelada',
  no_asistio: 'no asistió',
};

const DETALLE_CITA = {
  servicio: { select: { id: true, nombre: true, duracionMinutos: true } },
  recurso: { select: { id: true, nombre: true } },
  huesped: { select: { id: true, nombre: true, tipoDocumento: true, documento: true } },
  reserva: { select: { id: true, estado: true, habitacion: { select: { numero: true } } } },
} as const;

const DETALLE_SALIDA = {
  servicio: {
    select: {
      id: true,
      nombre: true,
      modoPrecio: true,
      precio: true,
      precioNino: true,
      duracionMinutos: true,
    },
  },
  tomados: {
    include: {
      huesped: { select: { nombre: true, tipoDocumento: true, documento: true } },
      reserva: { select: { id: true, habitacion: { select: { numero: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  },
} as const;

// Lo que se cobra de una cita o un cupo, y a qué se ata su pago.
interface Cobrable {
  hotelId: string;
  servicioId: string;
  categoria: CategoriaCargo;
  concepto: string;
  valor: Prisma.Decimal;
  reserva: Pick<Reserva, 'id' | 'estado'> | null;
  destino: { citaId: string } | { cupoId: string };
}

// Lo pagado en el momento (pagos menos reembolsos vigentes) y el medio del último.
function pagadoDe(
  pagos: { tipo: string; monto: Prisma.Decimal; anulado: boolean; medio: string }[],
) {
  const { saldo } = calcularSaldo({
    debe: 0,
    pagos: pagos.map((p) => ({
      tipo: p.tipo as 'abono' | 'reembolso',
      monto: p.monto.toNumber(),
      anulado: p.anulado,
    })),
  });
  return { pagado: -saldo, medio: pagos.filter((p) => !p.anulado).at(-1)?.medio };
}

// S-2: agenda de las citas (spa) y cupos de las experiencias. Las citas tienen
// la misma garantía que las habitaciones: la restricción cita_sin_cruce (la
// verificación previa solo da el mensaje claro). Los cupos se protegen con el
// bloqueo de la fila de la salida: aquí se suma, no se cruza.
@Injectable()
export class AgendaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reloj: Reloj,
    private readonly huespedes: HuespedesService,
  ) {}

  // ── Recursos ──────────────────────────────────────────────────────────

  listarRecursos(hotelId: string) {
    return this.prisma.recursoServicio.findMany({
      where: { hotelId },
      include: {
        servicios: {
          include: { servicio: { select: { id: true, nombre: true, duracionMinutos: true } } },
        },
      },
      orderBy: { nombre: 'asc' },
    });
  }

  async crearRecurso(hotelId: string, dto: CrearRecursoDto) {
    const ids = await this.serviciosDeCita(hotelId, dto.servicioIds ?? []);
    try {
      return await this.prisma.recursoServicio.create({
        data: {
          hotelId,
          nombre: dto.nombre.trim(),
          activo: dto.activo ?? true,
          servicios: { create: ids.map((servicioId) => ({ servicioId })) },
        },
      });
    } catch (error) {
      throw this.nombreRepetido(error, dto.nombre);
    }
  }

  async actualizarRecurso(hotelId: string, id: string, dto: ActualizarRecursoDto) {
    await this.recursoDelHotel(hotelId, id);
    const ids = dto.servicioIds && (await this.serviciosDeCita(hotelId, dto.servicioIds));
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Qué servicios presta es configuración (no un registro con valor
        // legal): se reemplaza la lista. Las citas ya agendadas no cambian.
        if (ids) {
          await tx.recursoDeServicio.deleteMany({ where: { recursoId: id } });
          await tx.recursoDeServicio.createMany({
            data: ids.map((servicioId) => ({ recursoId: id, servicioId })),
          });
        }
        return tx.recursoServicio.update({
          where: { id },
          data: { nombre: dto.nombre?.trim(), activo: dto.activo },
        });
      });
    } catch (error) {
      throw this.nombreRepetido(error, dto.nombre);
    }
  }

  // ── Agenda del día y huecos ───────────────────────────────────────────

  async agenda(hotelId: string, fecha?: string, recursoId?: string) {
    const dia = fecha?.slice(0, 10) ?? fechaDelHotel(this.reloj.ahora()).toISOString().slice(0, 10);
    const desde = instanteDelDia(dia, 0);
    const [recursos, citas] = await Promise.all([
      this.listarRecursos(hotelId),
      this.prisma.citaServicio.findMany({
        where: {
          hotelId,
          recursoId,
          inicio: { gte: desde, lt: sumarMinutos(desde, 24 * 60) },
        },
        include: DETALLE_CITA,
        orderBy: { inicio: 'asc' },
      }),
    ]);
    return { fecha: dia, recursos, citas };
  }

  async disponibilidad(hotel: ContextoHotel, servicioId: string, fecha: string) {
    const servicio = await this.servicioDe(hotel.id, servicioId, 'cita');
    const dia = fecha.slice(0, 10);
    const desde = instanteDelDia(dia, 0);
    const hasta = sumarMinutos(desde, 24 * 60);
    const recursos = await this.prisma.recursoServicio.findMany({
      where: { hotelId: hotel.id, activo: true, servicios: { some: { servicioId } } },
      include: {
        citas: {
          where: {
            estado: { in: CITAS_VIGENTES },
            inicio: { lt: hasta },
            finOcupado: { gt: desde },
          },
          select: { inicio: true, finOcupado: true },
        },
      },
      orderBy: { nombre: 'asc' },
    });
    return recursos.map((r) => ({
      recursoId: r.id,
      nombre: r.nombre,
      huecos: huecosLibres({
        fecha: dia,
        disponibilidad: servicio.disponibilidad as unknown as Disponibilidad | null,
        duracionMinutos: servicio.duracionMinutos!,
        margenMinutos: hotel.politicas.minutosEntreCitas,
        ocupados: r.citas,
        noAntesDe: this.reloj.ahora(),
      }),
    }));
  }

  // Las citas y los cupos de una reserva (para su detalle).
  async deReserva(hotelId: string, reservaId: string) {
    const reserva = await this.prisma.reserva.findFirst({ where: { id: reservaId, hotelId } });
    if (!reserva) throw new NotFoundException('Reserva no encontrada');
    const [citas, cupos] = await Promise.all([
      this.prisma.citaServicio.findMany({
        where: { reservaId },
        include: DETALLE_CITA,
        orderBy: { inicio: 'asc' },
      }),
      this.prisma.cupoExperiencia.findMany({
        where: { reservaId },
        include: { salida: { include: { servicio: { select: { nombre: true } } } } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    return { citas, cupos };
  }

  // ── Citas ─────────────────────────────────────────────────────────────

  async agendar(hotel: ContextoHotel, dto: AgendarCitaDto, quien: UsuarioAutenticado) {
    const ahora = this.reloj.ahora();
    const servicio = await this.servicioDe(hotel.id, dto.servicioId, 'cita');
    const recurso = await this.recursoDelHotel(hotel.id, dto.recursoId);
    if (!recurso.activo || !recurso.servicios.some((s) => s.servicioId === servicio.id)) {
      throw new BadRequestException(`${recurso.nombre} no presta ${servicio.nombre}`);
    }

    const inicio = new Date(dto.inicio);
    const fin = sumarMinutos(inicio, servicio.duracionMinutos!);
    const finOcupado = sumarMinutos(fin, hotel.politicas.minutosEntreCitas);
    if (inicio < ahora) {
      throw new BadRequestException('No se puede agendar una cita en el pasado');
    }
    this.exigirHorario(servicio, inicio, fin);
    const precio = this.precio(hotel, servicio, dto);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const { reserva, huespedId } = await this.quienToma(tx, hotel, dto, inicio);
        // Verificación previa: solo para dar el mensaje claro. La garantía es
        // la restricción cita_sin_cruce (ver la prueba de concurrencia).
        const cruce = await tx.citaServicio.findFirst({
          where: {
            recursoId: recurso.id,
            estado: { in: CITAS_VIGENTES },
            inicio: { lt: finOcupado },
            finOcupado: { gt: inicio },
          },
        });
        if (cruce) throw new ConflictException(MENSAJE_CRUCE);

        const cita = await tx.citaServicio.create({
          data: {
            hotelId: hotel.id,
            servicioId: servicio.id,
            recursoId: recurso.id,
            reservaId: reserva?.id,
            huespedId,
            inicio,
            fin,
            finOcupado,
            cantidad: dto.cantidad ?? 1,
            adultos: dto.adultos ?? 0,
            edadesNinos: dto.edadesNinos ?? [],
            valor: precio.total,
            concepto: precio.concepto,
            usuarioId: quien.id,
          },
        });
        const cobrable = this.cobrable(hotel.id, servicio, cita, reserva, { citaId: cita.id });
        if (this.cobrarAlTomar(hotel, reserva)) {
          const cargoId = await this.cobrar(tx, hotel, cobrable, dto.pago, quien.id, ahora);
          if (cargoId) await tx.citaServicio.update({ where: { id: cita.id }, data: { cargoId } });
        }
        return tx.citaServicio.findUniqueOrThrow({ where: { id: cita.id }, include: DETALLE_CITA });
      });
    } catch (error) {
      if (esViolacionDeNoSobreventa(error) || esInterbloqueo(error)) {
        throw new ConflictException(MENSAJE_CRUCE);
      }
      throw error;
    }
  }

  async cambiarEstadoCita(
    hotel: ContextoHotel,
    id: string,
    dto: CambiarEstadoCitaDto,
    quien: UsuarioAutenticado,
  ) {
    const ahora = this.reloj.ahora();
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM cita_servicio WHERE id = ${id} AND hotel_id = ${hotel.id} FOR UPDATE`;
      const cita = await tx.citaServicio.findFirst({
        where: { id, hotelId: hotel.id },
        include: {
          servicio: { include: { categoria: true } },
          reserva: true,
          cargo: true,
          pagos: true,
        },
      });
      if (!cita) throw new NotFoundException('Cita no encontrada');
      if (!TRANSICIONES[cita.estado].includes(dto.estado)) {
        throw new ConflictException(
          `Una cita ${ETIQUETA_CITA[cita.estado]} no puede pasar a ${ETIQUETA_CITA[dto.estado]}`,
        );
      }

      const cobrable = this.cobrable(hotel.id, cita.servicio, cita, cita.reserva, {
        citaId: cita.id,
      });
      let cargoId = cita.cargoId;
      if (dto.estado === 'realizada' && !cita.cargoId && pagadoDe(cita.pagos).pagado === 0) {
        // al_prestar: entra al folio al prestarla (o se paga si ya no hay estadía).
        cargoId = await this.cobrar(tx, hotel, cobrable, dto.pago, quien.id, ahora);
      }
      if (dto.estado === 'cancelada' || dto.estado === 'no_asistio') {
        const tarde =
          dto.estado === 'no_asistio' ||
          cita.inicio.getTime() - ahora.getTime() <
            hotel.politicas.horasCancelacionServicio * MS_HORA;
        cargoId = await this.cancelarCobro(
          tx,
          hotel,
          cobrable,
          cita.cargo,
          cita.pagos,
          tarde,
          quien.id,
          ahora,
        );
      }
      return tx.citaServicio.update({
        where: { id },
        data: { estado: dto.estado, cargoId },
        include: DETALLE_CITA,
      });
    });
  }

  // ── Salidas y cupos ───────────────────────────────────────────────────

  async listarSalidas(hotelId: string, desdeTexto?: string, hastaTexto?: string) {
    const hoy = fechaDelHotel(this.reloj.ahora());
    const desde = desdeTexto ? new Date(desdeTexto.slice(0, 10)) : hoy;
    const hasta = hastaTexto
      ? new Date(hastaTexto.slice(0, 10))
      : sumarDias(desde, DIAS_SALIDAS_POR_DEFECTO);
    const salidas = await this.prisma.salidaExperiencia.findMany({
      where: {
        hotelId,
        inicio: {
          gte: instanteDelDia(desde.toISOString().slice(0, 10), 0),
          lt: instanteDelDia(sumarDias(hasta, 1).toISOString().slice(0, 10), 0),
        },
      },
      include: DETALLE_SALIDA,
      orderBy: { inicio: 'asc' },
    });
    return salidas.map((s) => {
      const ocupados = s.tomados
        .filter((c) => c.estado === 'vigente')
        .reduce((suma, c) => suma + c.personas, 0);
      return { ...s, ocupados, libres: Math.max(0, s.cupos - ocupados) };
    });
  }

  // Una salida y, con repetirSemanas, la misma de las próximas N semanas (todas o ninguna).
  async crearSalidas(hotelId: string, dto: CrearSalidaDto) {
    const servicio = await this.servicioDe(hotelId, dto.servicioId, 'experiencia');
    const cupos = dto.cupos ?? servicio.cuposPorSalida;
    if (!cupos) {
      throw new BadRequestException('Indica los cupos: el servicio no tiene cupos por salida');
    }
    const primera = new Date(dto.inicio);
    const inicios = Array.from({ length: (dto.repetirSemanas ?? 0) + 1 }, (_, i) =>
      sumarMinutos(primera, i * 7 * 24 * 60),
    );
    for (const inicio of inicios) {
      this.exigirHorario(servicio, inicio, sumarMinutos(inicio, servicio.duracionMinutos ?? 0));
    }
    return this.prisma.$transaction((tx) =>
      Promise.all(
        inicios.map((inicio) =>
          tx.salidaExperiencia.create({
            data: { hotelId, servicioId: servicio.id, inicio, cupos },
          }),
        ),
      ),
    );
  }

  async tomarCupo(
    hotel: ContextoHotel,
    salidaId: string,
    dto: TomarCupoDto,
    quien: UsuarioAutenticado,
  ) {
    const ahora = this.reloj.ahora();
    return this.prisma.$transaction(async (tx) => {
      // El bloqueo de la salida ordena las peticiones simultáneas: cada una
      // suma los cupos ya tomados después de la anterior.
      const salida = await this.bloquearSalida(tx, hotel.id, salidaId);
      if (salida.estado !== 'programada') {
        throw new ConflictException(`La salida está ${salida.estado}`);
      }
      if (salida.inicio < ahora) {
        throw new BadRequestException('La salida ya empezó');
      }
      const servicio = await tx.servicio.findUniqueOrThrow({
        where: { id: salida.servicioId },
        include: { categoria: true },
      });
      const personas =
        servicio.modoPrecio === 'por_edad'
          ? (dto.adultos ?? 0) + (dto.edadesNinos?.length ?? 0)
          : (dto.cantidad ?? 1);
      const { _sum } = await tx.cupoExperiencia.aggregate({
        where: { salidaId, estado: 'vigente' },
        _sum: { personas: true },
      });
      const libres = salida.cupos - (_sum.personas ?? 0);
      if (personas > libres) {
        throw new ConflictException(
          libres === 0 ? 'La salida no tiene cupos libres' : `Quedan ${libres} cupos en la salida`,
        );
      }

      const precio = this.precio(hotel, servicio, { ...dto, cantidad: personas });
      const { reserva, huespedId } = await this.quienToma(tx, hotel, dto, salida.inicio);
      const cupo = await tx.cupoExperiencia.create({
        data: {
          hotelId: hotel.id,
          salidaId,
          reservaId: reserva?.id,
          huespedId,
          personas,
          adultos: dto.adultos ?? 0,
          edadesNinos: dto.edadesNinos ?? [],
          valor: precio.total,
          concepto: precio.concepto,
          usuarioId: quien.id,
        },
      });
      if (this.cobrarAlTomar(hotel, reserva)) {
        const cobrable = this.cobrable(hotel.id, servicio, cupo, reserva, { cupoId: cupo.id });
        const cargoId = await this.cobrar(tx, hotel, cobrable, dto.pago, quien.id, ahora);
        if (cargoId) await tx.cupoExperiencia.update({ where: { id: cupo.id }, data: { cargoId } });
      }
      return tx.cupoExperiencia.findUniqueOrThrow({ where: { id: cupo.id } });
    });
  }

  async cancelarCupo(hotel: ContextoHotel, id: string, quien: UsuarioAutenticado) {
    const ahora = this.reloj.ahora();
    return this.prisma.$transaction(async (tx) => {
      const encontrado = await tx.cupoExperiencia.findFirst({ where: { id, hotelId: hotel.id } });
      if (!encontrado) throw new NotFoundException('Cupo no encontrado');
      const salida = await this.bloquearSalida(tx, hotel.id, encontrado.salidaId);
      const cupo = await tx.cupoExperiencia.findUniqueOrThrow({
        where: { id },
        include: { reserva: true, cargo: true, pagos: true },
      });
      if (cupo.estado !== 'vigente') throw new ConflictException('El cupo ya está cancelado');
      const servicio = await tx.servicio.findUniqueOrThrow({
        where: { id: salida.servicioId },
        include: { categoria: true },
      });
      const tarde =
        salida.inicio.getTime() - ahora.getTime() <
        hotel.politicas.horasCancelacionServicio * MS_HORA;
      const cobrable = this.cobrable(hotel.id, servicio, cupo, cupo.reserva, { cupoId: cupo.id });
      const cargoId = await this.cancelarCobro(
        tx,
        hotel,
        cobrable,
        cupo.cargo,
        cupo.pagos,
        tarde,
        quien.id,
        ahora,
      );
      return tx.cupoExperiencia.update({ where: { id }, data: { estado: 'cancelado', cargoId } });
    });
  }

  // Realizada: con al_prestar, carga al folio los cupos que aún no se cobraron.
  // Cancelada (la cancela el hotel): devuelve todo, sin penalidad.
  async cambiarEstadoSalida(
    hotel: ContextoHotel,
    id: string,
    dto: CambiarEstadoSalidaDto,
    quien: UsuarioAutenticado,
  ) {
    const ahora = this.reloj.ahora();
    return this.prisma.$transaction(async (tx) => {
      const salida = await this.bloquearSalida(tx, hotel.id, id);
      if (salida.estado !== 'programada') {
        throw new ConflictException(`La salida ya está ${salida.estado}`);
      }
      const servicio = await tx.servicio.findUniqueOrThrow({
        where: { id: salida.servicioId },
        include: { categoria: true },
      });
      const cupos = await tx.cupoExperiencia.findMany({
        where: { salidaId: id, estado: 'vigente' },
        include: { reserva: true, cargo: true, pagos: true, huesped: { select: { nombre: true } } },
      });
      for (const cupo of cupos) {
        const cobrable = this.cobrable(hotel.id, servicio, cupo, cupo.reserva, { cupoId: cupo.id });
        if (dto.estado === 'cancelada') {
          const cargoId = await this.cancelarCobro(
            tx,
            hotel,
            cobrable,
            cupo.cargo,
            cupo.pagos,
            false,
            quien.id,
            ahora,
          );
          await tx.cupoExperiencia.update({
            where: { id: cupo.id },
            data: { estado: 'cancelado', cargoId },
          });
        } else if (!cupo.cargoId && pagadoDe(cupo.pagos).pagado === 0) {
          if (cupo.reserva?.estado !== 'activa') {
            throw new ConflictException(
              `El cupo de ${cupo.huesped.nombre} ya no tiene una estadía activa a la cual cargarlo: cancélalo antes de cerrar la salida`,
            );
          }
          const cargoId = await this.cobrar(tx, hotel, cobrable, undefined, quien.id, ahora);
          await tx.cupoExperiencia.update({ where: { id: cupo.id }, data: { cargoId } });
        }
      }
      return tx.salidaExperiencia.update({
        where: { id },
        data: { estado: dto.estado },
        include: DETALLE_SALIDA,
      });
    });
  }

  // ── Cobro ─────────────────────────────────────────────────────────────

  // Sin estadía activa no hay folio: se cobra (con pago) al agendar o tomar el
  // cupo. Con estadía activa, según la política del hotel.
  private cobrarAlTomar(hotel: ContextoHotel, reserva: Pick<Reserva, 'estado'> | null) {
    return reserva?.estado !== 'activa' || hotel.politicas.cobroServicios === 'al_agendar';
  }

  // Con la estadía activa, cargo al folio (R21); si no, el pago en el momento.
  // Devuelve el id del cargo, o null si se pagó.
  private async cobrar(
    tx: Tx,
    hotel: ContextoHotel,
    c: Cobrable,
    pago: PagoInmediatoDto | undefined,
    usuarioId: string,
    ahora: Date,
  ) {
    if (c.reserva) {
      // El bloqueo ordena el cargo con un check-out que llegue a la vez.
      const reserva = await bloquearReserva(tx, hotel.id, c.reserva.id);
      if (reserva.estado === 'activa') {
        const cargo = await registrarCargo(
          tx,
          reserva.id,
          {
            servicioId: c.servicioId,
            categoria: c.categoria,
            concepto: c.concepto,
            cantidad: 1,
            valorUnitario: c.valor,
          },
          usuarioId,
          ahora,
        );
        return cargo.id;
      }
    }
    if (!pago) {
      throw new BadRequestException(
        `Sin una estadía activa no hay folio: registra el pago de ${dinero(c.valor)} en el momento`,
      );
    }
    exigirMedioDelHotel(hotel, pago.medio);
    await tx.pago.create({
      data: {
        ...c.destino,
        hotelId: c.hotelId,
        tipo: 'abono',
        medio: pago.medio,
        monto: c.valor,
        referencia: pago.referencia,
        usuarioId,
        turnoId: await turnoAbiertoDe(tx, usuarioId),
        fecha: ahora,
      },
    });
    return null;
  }

  // Cancelar (o no asistir): tarde cobra el porcentaje de la política. Lo
  // cargado se anula y queda la penalidad; lo pagado se devuelve menos la
  // penalidad. Devuelve el cargo que queda (la penalidad) o null.
  private async cancelarCobro(
    tx: Tx,
    hotel: ContextoHotel,
    c: Cobrable,
    cargo: {
      id: string;
      reservaId: string;
      concepto: string;
      total: Prisma.Decimal;
      anulado: boolean;
    } | null,
    pagos: { tipo: string; monto: Prisma.Decimal; anulado: boolean; medio: string }[],
    tarde: boolean,
    usuarioId: string,
    ahora: Date,
  ) {
    const penalidad = tarde
      ? c.valor.mul(hotel.politicas.porcentajeCancelacionServicio).div(100).toDecimalPlaces(0)
      : new Prisma.Decimal(0);
    const reserva = c.reserva && (await bloquearReserva(tx, hotel.id, c.reserva.id));
    const conFolio = reserva?.estado === 'activa';
    const cargarPenalidad = async () =>
      penalidad.isZero() || !conFolio
        ? null
        : (
            await registrarCargo(
              tx,
              reserva.id,
              {
                servicioId: c.servicioId,
                categoria: c.categoria,
                concepto: `Penalidad por cancelar: ${c.concepto}`,
                cantidad: 1,
                valorUnitario: penalidad,
              },
              usuarioId,
              ahora,
            )
          ).id;

    if (cargo && !cargo.anulado) {
      // Con el folio ya cerrado (R21) el cargo queda como se liquidó.
      if (!conFolio) return cargo.id;
      await anularCargoEn(tx, cargo, 'Cancelación del servicio', usuarioId, ahora);
      return cargarPenalidad();
    }
    const { pagado, medio } = pagadoDe(pagos);
    if (pagado > 0) {
      const reembolso = new Prisma.Decimal(pagado).sub(penalidad);
      if (reembolso.gt(0)) {
        await tx.pago.create({
          data: {
            ...c.destino,
            hotelId: c.hotelId,
            tipo: 'reembolso',
            medio: medio as MedioPago,
            monto: reembolso,
            usuarioId,
            turnoId: await turnoAbiertoDe(tx, usuarioId),
            fecha: ahora,
          },
        });
      }
      return null;
    }
    return cargarPenalidad();
  }

  private cobrable(
    hotelId: string,
    servicio: Servicio & { categoria: { clasificacion: CategoriaCargo } },
    registro: { valor: Prisma.Decimal; concepto: string },
    reserva: Pick<Reserva, 'id' | 'estado'> | null,
    destino: Cobrable['destino'],
  ): Cobrable {
    return {
      hotelId,
      servicioId: servicio.id,
      categoria: servicio.categoria.clasificacion,
      concepto: registro.concepto,
      valor: registro.valor,
      reserva,
      destino,
    };
  }

  // ── Ayudantes ─────────────────────────────────────────────────────────

  // De una reserva del hotel (vigente y cuya estadía incluye el día) o de un
  // huésped externo.
  private async quienToma(
    tx: Tx,
    hotel: ContextoHotel,
    dto: { reservaId?: string; huesped?: AgendarCitaDto['huesped'] },
    inicio: Date,
  ) {
    if (Boolean(dto.reservaId) === Boolean(dto.huesped)) {
      throw new BadRequestException(
        'Indica la reserva o los datos del huésped externo (uno de los dos)',
      );
    }
    if (dto.huesped) {
      const huesped = await this.huespedes.obtenerOCrear(
        hotel.id,
        titularDeReserva(dto.huesped),
        tx,
      );
      return { reserva: null, huespedId: huesped.id };
    }
    const reserva = await tx.reserva.findFirst({ where: { id: dto.reservaId, hotelId: hotel.id } });
    if (!reserva) throw new NotFoundException('Reserva no encontrada');
    if (reserva.estado !== 'confirmada' && reserva.estado !== 'activa') {
      throw new BadRequestException(`La reserva está ${reserva.estado}`);
    }
    const dia = horaDelHotel(inicio).fecha;
    const entrada = reserva.fechaEntrada.toISOString().slice(0, 10);
    const salida = reserva.fechaSalida.toISOString().slice(0, 10);
    if (dia < entrada || dia > salida) {
      throw new BadRequestException('El servicio debe caer dentro de las fechas de la estadía');
    }
    return { reserva, huespedId: reserva.huespedId };
  }

  private precio(
    hotel: ContextoHotel,
    servicio: Servicio,
    quienes: { cantidad?: number; adultos?: number; edadesNinos?: number[] },
  ) {
    try {
      const precio = precioDelServicio(
        {
          nombre: servicio.nombre,
          modoPrecio: servicio.modoPrecio,
          precio: servicio.precio.toNumber(),
          precioNino: servicio.precioNino?.toNumber() ?? null,
        },
        { ...quienes, cantidad: quienes.cantidad ?? 1 },
        {
          gratisHasta: hotel.politicas.edadMaximaNinoGratis,
          ninoHasta: hotel.politicas.edadMaximaNino,
        },
      );
      return { total: new Prisma.Decimal(precio.total), concepto: precio.concepto };
    } catch (error) {
      if (error instanceof DatosDePrecioError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  private exigirHorario(servicio: Servicio, inicio: Date, fin: Date) {
    const disponibilidad = servicio.disponibilidad as unknown as Disponibilidad | null;
    if (!dentroDelHorario(disponibilidad, inicio, fin)) {
      throw new BadRequestException(
        `Fuera del horario de ${servicio.nombre} (${disponibilidad!.desde} a ${disponibilidad!.hasta})`,
      );
    }
  }

  private async servicioDe(hotelId: string, id: string, tipo: 'cita' | 'experiencia') {
    const servicio = await this.prisma.servicio.findFirst({
      where: { id, hotelId, tipo, activo: true },
      include: { categoria: true },
    });
    if (!servicio) {
      throw new NotFoundException(
        tipo === 'cita' ? 'Servicio de cita no encontrado' : 'Experiencia no encontrada',
      );
    }
    if (tipo === 'cita' && !servicio.duracionMinutos) {
      throw new BadRequestException(`${servicio.nombre} no tiene duración: no se puede agendar`);
    }
    return servicio;
  }

  private async recursoDelHotel(hotelId: string, id: string) {
    const recurso = await this.prisma.recursoServicio.findFirst({
      where: { id, hotelId },
      include: { servicios: true },
    });
    if (!recurso) throw new NotFoundException('Recurso no encontrado');
    return recurso;
  }

  private async serviciosDeCita(hotelId: string, ids: string[]) {
    const unicos = [...new Set(ids)];
    const encontrados = await this.prisma.servicio.count({
      where: { id: { in: unicos }, hotelId, tipo: 'cita' },
    });
    if (encontrados !== unicos.length) {
      throw new BadRequestException('Un recurso solo presta servicios de tipo cita del hotel');
    }
    return unicos;
  }

  private async bloquearSalida(tx: Tx, hotelId: string, id: string) {
    await tx.$queryRaw`SELECT id FROM salida_experiencia WHERE id = ${id} AND hotel_id = ${hotelId} FOR UPDATE`;
    const salida = await tx.salidaExperiencia.findFirst({ where: { id, hotelId } });
    if (!salida) throw new NotFoundException('Salida no encontrada');
    return salida;
  }

  private nombreRepetido(error: unknown, nombre?: string) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return new ConflictException(`Ya existe un recurso llamado "${nombre}"`);
    }
    return error;
  }
}
