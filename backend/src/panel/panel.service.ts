import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Reloj } from '../hotel/reloj';
import { fechaDelHotel, limiteNoShow, sumarDias } from '../hotel/politicas';
import { DIAS_CALENDARIO_POR_DEFECTO } from './panel.dto';

const CON_DETALLE = { habitacion: true, huesped: true } as const;

// Primer día del mes y del mes siguiente (fechas de calendario a medianoche UTC).
function limitesDelMes(dia: Date) {
  const inicio = new Date(Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), 1));
  const fin = new Date(Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth() + 1, 1));
  return { inicio, fin };
}

const sumar = (valores: (Prisma.Decimal | null)[]) =>
  valores.reduce<Prisma.Decimal>((acc, v) => (v ? acc.add(v) : acc), new Prisma.Decimal(0));

// Vistas de operación diaria para recepción y gerencia (solo lectura).
@Injectable()
export class PanelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reloj: Reloj,
  ) {}

  async hoy() {
    const ahora = this.reloj.ahora();
    const hoy = fechaDelHotel(ahora);
    const { inicio, fin } = limitesDelMes(hoy);

    const [
      totalHabitaciones,
      nocheDeHoy,
      confirmadasPorLlegar,
      activas,
      cerradasDelMes,
      penalidadesDelMes,
    ] = await Promise.all([
      this.prisma.habitacion.count(),
      // Reservas que ocupan la noche de hoy: entran hoy o antes y salen después de hoy.
      this.prisma.reserva.count({
        where: {
          estado: { in: ['confirmada', 'activa'] },
          fechaEntrada: { lte: hoy },
          fechaSalida: { gt: hoy },
        },
      }),
      this.prisma.reserva.findMany({
        where: { estado: 'confirmada', fechaEntrada: { lte: hoy } },
        include: CON_DETALLE,
        orderBy: { fechaEntrada: 'asc' },
      }),
      this.prisma.reserva.findMany({
        where: { estado: 'activa' },
        include: CON_DETALLE,
        orderBy: { fechaSalida: 'asc' },
      }),
      // Ingresos por alojamiento: estadías liquidadas con salida en este mes.
      this.prisma.reserva.findMany({
        where: { estado: 'cerrada', fechaSalida: { gte: inicio, lt: fin } },
        select: { total: true },
      }),
      // Penalidades de cancelaciones tardías y no-shows de reservas de este mes.
      this.prisma.reserva.findMany({
        where: {
          estado: { in: ['cancelada', 'no_show'] },
          fechaEntrada: { gte: inicio, lt: fin },
        },
        select: { total: true },
      }),
    ]);

    // Llegadas pendientes: las de hoy y las atrasadas que aún no vencen (no-show).
    const llegadas = confirmadasPorLlegar
      .filter((r) => ahora < limiteNoShow(r.fechaEntrada))
      .map((r) => ({ ...r, atrasada: r.fechaEntrada < hoy }));
    // Salidas pendientes: alojados que deben salir hoy (o ya debieron salir).
    const salidas = activas
      .filter((r) => r.fechaSalida <= hoy)
      .map((r) => ({ ...r, atrasada: r.fechaSalida < hoy }));

    const alojamiento = sumar(cerradasDelMes.map((r) => r.total));
    const penalidades = sumar(penalidadesDelMes.map((r) => r.total));

    return {
      fecha: hoy,
      ocupacion: {
        habitacionesOcupadas: nocheDeHoy,
        totalHabitaciones,
        porcentaje: totalHabitaciones ? Math.round((nocheDeHoy / totalHabitaciones) * 100) : 0,
      },
      huespedesAlojados: activas.length,
      llegadas,
      salidas,
      ingresosDelMes: {
        alojamiento,
        penalidades,
        total: alojamiento.add(penalidades),
      },
    };
  }

  // Cuadrícula habitaciones × días. Incluye reservas que ocupan noches del
  // rango (confirmadas, activas y cerradas); las canceladas y no-shows no
  // ocupan la habitación y no se muestran.
  async calendario(desde?: string, dias = DIAS_CALENDARIO_POR_DEFECTO) {
    const inicio = desde ? new Date(desde.slice(0, 10)) : fechaDelHotel(this.reloj.ahora());
    const fin = sumarDias(inicio, dias);

    const [habitaciones, reservas] = await Promise.all([
      this.prisma.habitacion.findMany({
        include: { tipoHabitacion: true },
        orderBy: { numero: 'asc' },
      }),
      this.prisma.reserva.findMany({
        where: {
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
