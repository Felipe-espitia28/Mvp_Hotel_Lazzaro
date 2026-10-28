import { BadRequestException, Injectable } from '@nestjs/common';
import { EstadoHabitacion, EstadoReserva, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Reloj } from '../hotel/reloj';
import {
  contarNoches,
  fechaDelHotel,
  instanteDelHotel,
  limiteNoShow,
  sumarDias,
} from '../hotel/politicas';
import { DIAS_CALENDARIO_POR_DEFECTO, DIAS_GERENCIA_MAXIMO } from './panel.dto';
import { ContextoHotel } from '../auth/decoradores';
import { anticipoPendiente, conNumeroHuespedes } from '../reservas/huespedes-de-reserva';
import { FolioService, anticiposVigentes, saldoDe } from '../folio/folio.service';
import { Desglose } from '../tarifas/motor-tarificacion';
import {
  ReservaDelRango,
  calcularIndicadores,
  periodoAnterior,
  resumenPickup,
  variacion,
} from './indicadores';

const CON_DETALLE = { habitacion: true, huesped: true } as const;
const MS_DIA = 24 * 60 * 60 * 1000;

// Primer y último día del mes (fechas de calendario a medianoche UTC).
function limitesDelMes(dia: Date) {
  const inicio = new Date(Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), 1));
  const ultimo = new Date(Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth() + 1, 0));
  return { inicio, ultimo };
}

const CAMPOS_INDICADORES = {
  estado: true,
  fechaEntrada: true,
  fechaSalida: true,
  valorAlojamiento: true,
  total: true,
  desglose: true,
} as const;

// Lo que la función pura necesita de una reserva (los Decimal, como número).
const paraIndicadores = (r: {
  estado: EstadoReserva;
  fechaEntrada: Date;
  fechaSalida: Date;
  valorAlojamiento: Prisma.Decimal;
  total: Prisma.Decimal | null;
  desglose: Prisma.JsonValue;
}): ReservaDelRango => ({
  estado: r.estado,
  fechaEntrada: r.fechaEntrada,
  fechaSalida: r.fechaSalida,
  valorAlojamiento: r.valorAlojamiento.toNumber(),
  total: r.total?.toNumber() ?? null,
  desglose: r.desglose as unknown as Desglose | null,
});

// Vistas del panel (solo lectura): la operación del día para recepción y los
// indicadores del negocio para gerencia (B-1).
@Injectable()
export class PanelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reloj: Reloj,
    private readonly folio: FolioService,
  ) {}

  // B-1: las habitaciones, las reservas que tocan días del rango (de todos los
  // estados: la función pura separa las vendidas) y los consumos vigentes de
  // esos días, para calcularIndicadores.
  private async indicadores(hotelId: string, desde: Date, hasta: Date) {
    const [habitaciones, reservas, cargos] = await Promise.all([
      this.prisma.habitacion.findMany({ where: { hotelId }, select: { id: true, estado: true } }),
      this.prisma.reserva.findMany({
        where: { hotelId, fechaEntrada: { lte: hasta }, fechaSalida: { gt: desde } },
        select: CAMPOS_INDICADORES,
      }),
      // Los cargos de una cancelada o un no-show (p. ej. una penalidad por
      // acortar) ya están en su total: no se cuentan dos veces.
      this.prisma.cargo.findMany({
        where: {
          anulado: false,
          fecha: { gte: instanteDelHotel(desde, 0), lt: instanteDelHotel(sumarDias(hasta, 1), 0) },
          reserva: { hotelId, estado: { notIn: ['cancelada', 'no_show'] } },
        },
        select: { categoria: true, total: true, fecha: true },
      }),
    ]);
    return calcularIndicadores({
      habitaciones,
      reservas: reservas.map(paraIndicadores),
      cargos: cargos.map((c) => ({ ...c, total: c.total.toNumber() })),
      desde,
      hasta,
    });
  }

  async hoy(hotel: ContextoHotel) {
    const hotelId = hotel.id;
    const ahora = this.reloj.ahora();
    const hoy = fechaDelHotel(ahora);
    const { inicio, ultimo } = limitesDelMes(hoy);

    const [habitacionesPorEstado, porLimpiar, nocheDeHoy, confirmadas, activas, delMes] =
      await Promise.all([
        this.prisma.habitacion.groupBy({
          by: ['estado'],
          where: { hotelId },
          _count: { _all: true },
        }),
        this.prisma.habitacion.findMany({
          where: { hotelId, estado: 'en_limpieza' },
          select: { id: true, numero: true },
          orderBy: { numero: 'asc' },
        }),
        // Reservas que ocupan la noche de hoy: entran hoy o antes y salen después de hoy.
        this.prisma.reserva.count({
          where: {
            hotelId,
            estado: { in: ['confirmada', 'activa'] },
            fechaEntrada: { lte: hoy },
            fechaSalida: { gt: hoy },
          },
        }),
        // Las que llegan hoy (o están atrasadas) y las de los próximos días,
        // para avisar los anticipos pendientes (A-2).
        this.prisma.reserva.findMany({
          where: { hotelId, estado: 'confirmada', fechaEntrada: { lte: sumarDias(hoy, 7) } },
          include: CON_DETALLE,
          orderBy: { fechaEntrada: 'asc' },
        }),
        this.prisma.reserva.findMany({
          where: { hotelId, estado: 'activa' },
          include: CON_DETALLE,
          orderBy: { fechaSalida: 'asc' },
        }),
        // B-1: los ingresos del mes se atribuyen por noche, no por la fecha de salida.
        this.indicadores(hotelId, inicio, ultimo),
      ]);

    const cuantas = (estado: EstadoHabitacion) =>
      habitacionesPorEstado.find((g) => g.estado === estado)?._count._all ?? 0;
    const totalHabitaciones =
      habitacionesPorEstado.reduce((suma, g) => suma + g._count._all, 0) -
      cuantas('fuera_servicio');

    // Las que aún no vencen (no-show): las de hoy, las atrasadas y las próximas.
    const vigentes = confirmadas.filter(
      (r) => ahora < limiteNoShow(r.fechaEntrada, hotel.politicas),
    );
    // A-2: las que el hotel exige con anticipo y aún no lo tienen quedan marcadas.
    const anticipos = await anticiposVigentes(
      this.prisma,
      vigentes.map((r) => r.id),
    );
    const conAnticipo = vigentes.map((r) => ({
      ...conNumeroHuespedes(r),
      atrasada: r.fechaEntrada < hoy,
      anticipoPendiente: anticipoPendiente(
        r,
        anticipos.get(r.id) ?? 0,
        hoy,
        hotel.politicas.anticipoObligatorio,
      ),
    }));
    // Llegadas pendientes: las de hoy y las atrasadas.
    const llegadas = conAnticipo.filter((r) => r.fechaEntrada <= hoy);
    // B-1: recepción llama a los que llegan en los próximos días sin anticipo.
    const anticiposPendientes = conAnticipo.filter((r) => r.anticipoPendiente);
    // Salidas pendientes: alojados que deben salir hoy (o ya debieron salir),
    // con su saldo (B-1: lo que hay que cobrar antes de que se vayan).
    const salidas = await Promise.all(
      activas
        .filter((r) => r.fechaSalida <= hoy)
        .map(async (r) => ({
          ...conNumeroHuespedes(r),
          atrasada: r.fechaSalida < hoy,
          saldo: (await saldoDe(this.prisma, r)).saldo,
        })),
    );

    return {
      fecha: hoy,
      calculadoEn: ahora,
      // La ocupación se mide sobre las habitaciones en servicio (R26).
      ocupacion: {
        habitacionesOcupadas: nocheDeHoy,
        totalHabitaciones,
        porcentaje: totalHabitaciones ? Math.round((nocheDeHoy / totalHabitaciones) * 100) : 0,
      },
      habitaciones: {
        porLimpiar: cuantas('en_limpieza'),
        porLimpiarLista: porLimpiar,
        fueraDeServicio: cuantas('fuera_servicio'),
      },
      huespedesAlojados: activas.length,
      llegadas,
      salidas,
      anticiposPendientes,
      ingresosDelMes: {
        alojamiento: delMes.ingresoAlojamiento,
        consumos: delMes.ingresoConsumos,
        penalidades: delMes.cancelaciones.penalidad + delMes.noShows.penalidad,
        total: delMes.ingresoTotal,
      },
    };
  }

  // B-1: cómo va el negocio en el período [desde, hasta] (por defecto, este
  // mes), comparado con el período anterior de la misma duración.
  async gerencia(hotel: ContextoHotel, desdeTexto?: string, hastaTexto?: string) {
    const ahora = this.reloj.ahora();
    const mes = limitesDelMes(fechaDelHotel(ahora));
    const desde = desdeTexto ? new Date(desdeTexto.slice(0, 10)) : mes.inicio;
    const hasta = hastaTexto ? new Date(hastaTexto.slice(0, 10)) : mes.ultimo;
    if (hasta < desde) {
      throw new BadRequestException('El final del período no puede ser antes del inicio');
    }
    if (contarNoches(desde, hasta) + 1 > DIAS_GERENCIA_MAXIMO) {
      throw new BadRequestException(`El período puede tener máximo ${DIAS_GERENCIA_MAXIMO} días`);
    }

    const previo = periodoAnterior(desde, hasta);
    const [actual, anterior, porCobrar, aFavor] = await Promise.all([
      this.indicadores(hotel.id, desde, hasta),
      this.indicadores(hotel.id, previo.desde, previo.hasta),
      this.folio.cuentasPorCobrar(hotel.id),
      this.folio.saldosAFavor(hotel.id),
    ]);
    const { serie, ...resumen } = actual;
    const { serie: _serieAnterior, ...resumenAnterior } = anterior;

    return {
      calculadoEn: ahora,
      periodo: { desde, hasta, dias: serie.length },
      periodoAnterior: previo,
      actual: resumen,
      anterior: resumenAnterior,
      variacion: variacion(actual, anterior),
      serie,
      // Las cuentas son de hoy, no del período: lo que se debe ahora.
      cuentasPorCobrar: {
        total: porCobrar.reduce((s, c) => s + c.saldo, 0),
        cuentas: porCobrar,
      },
      saldosAFavor: {
        total: aFavor.reduce((s, c) => s - c.saldo, 0),
        cuentas: aFavor,
      },
    };
  }

  // B-1: ocupación prevista de los próximos días con lo reservado hoy
  // (confirmadas y activas).
  async pronostico(hotelId: string, dias = 30) {
    const ahora = this.reloj.ahora();
    const desde = fechaDelHotel(ahora);
    const hasta = sumarDias(desde, dias - 1);
    const [habitaciones, reservas] = await Promise.all([
      this.prisma.habitacion.findMany({ where: { hotelId }, select: { id: true, estado: true } }),
      this.prisma.reserva.findMany({
        where: {
          hotelId,
          estado: { in: ['confirmada', 'activa'] },
          fechaEntrada: { lte: hasta },
          fechaSalida: { gt: desde },
        },
        select: CAMPOS_INDICADORES,
      }),
    ]);
    const { serie } = calcularIndicadores({
      habitaciones,
      reservas: reservas.map(paraIndicadores),
      cargos: [],
      desde,
      hasta,
    });
    return { calculadoEn: ahora, desde, dias, serie };
  }

  // B-1: reservas creadas en los últimos N días. La fecha de creación es la
  // del evento "creada" (reloj del hotel), sin importar la fecha de la estadía.
  async pickup(hotelId: string, dias = 7) {
    const ahora = this.reloj.ahora();
    const reservas = await this.prisma.reserva.findMany({
      where: {
        hotelId,
        eventos: {
          some: { tipo: 'creada', fecha: { gt: new Date(ahora.getTime() - dias * MS_DIA) } },
        },
      },
      select: CAMPOS_INDICADORES,
    });
    return { calculadoEn: ahora, dias, ...resumenPickup(reservas.map(paraIndicadores)) };
  }

  // Cuadrícula habitaciones × días. Incluye reservas que ocupan noches del
  // rango (confirmadas, activas y cerradas); las canceladas y no-shows no
  // ocupan la habitación y no se muestran.
  async calendario(hotelId: string, desde?: string, dias = DIAS_CALENDARIO_POR_DEFECTO) {
    const inicio = desde ? new Date(desde.slice(0, 10)) : fechaDelHotel(this.reloj.ahora());
    const fin = sumarDias(inicio, dias);

    const [habitaciones, reservas] = await Promise.all([
      this.prisma.habitacion.findMany({
        where: { hotelId },
        include: { tipoHabitacion: true },
        orderBy: { numero: 'asc' },
      }),
      this.prisma.reserva.findMany({
        where: {
          hotelId,
          estado: { in: ['confirmada', 'activa', 'cerrada'] },
          fechaEntrada: { lt: fin },
          fechaSalida: { gt: inicio },
        },
        select: {
          id: true,
          habitacionId: true,
          fechaEntrada: true,
          fechaSalida: true,
          estado: true,
          huesped: { select: { nombre: true } },
        },
        orderBy: { fechaEntrada: 'asc' },
      }),
    ]);

    return { desde: inicio, dias, hoy: fechaDelHotel(this.reloj.ahora()), habitaciones, reservas };
  }
}
