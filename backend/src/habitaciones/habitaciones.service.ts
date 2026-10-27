import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Reloj } from '../hotel/reloj';
import { fechaDelHotel } from '../hotel/politicas';
import { Huespedes, cotizar } from '../tarifas/motor-tarificacion';
import { condicionesDe, reglasDeTarifa } from '../tarifas/tarifas.service';
import { ContextoHotel } from '../auth/decoradores';
import { CrearHabitacionDto } from './dto/crear-habitacion.dto';
import { EstadoManual } from './dto/cambiar-estado.dto';

// Código de Prisma para violación de una restricción UNIQUE.
const CODIGO_PRISMA_UNICO = 'P2002';

@Injectable()
export class HabitacionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reloj: Reloj,
  ) {}

  listar(hotelId: string) {
    return this.prisma.habitacion.findMany({
      where: { hotelId },
      include: { tipoHabitacion: true },
      orderBy: { numero: 'asc' },
    });
  }

  async crear(hotelId: string, dto: CrearHabitacionDto) {
    const tipo = await this.prisma.tipoHabitacion.findFirst({
      where: { id: dto.tipoHabitacionId, hotelId },
    });
    if (!tipo) {
      throw new NotFoundException('Tipo de habitación no encontrado');
    }

    try {
      return await this.prisma.habitacion.create({
        data: { numero: dto.numero, tipoHabitacionId: tipo.id, hotelId },
        include: { tipoHabitacion: true },
      });
    } catch (error) {
      // El número de habitación es único: un duplicado es un conflicto (409), no un 500.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === CODIGO_PRISMA_UNICO
      ) {
        throw new ConflictException(`Ya existe la habitación ${dto.numero}`);
      }
      throw error;
    }
  }

  // Habitaciones libres en [desde, hasta) con capacidad para los huéspedes,
  // cada una con su precio cotizado para ese rango (R14). La cotización
  // incluye el IVA; si el huésped resulta exento se cobra el subtotal.
  async disponibles(
    hotel: ContextoHotel,
    desde: string,
    hasta: string,
    quienes: Huespedes = { adultos: 1, edadesNinos: [] },
  ) {
    // R6: la capacidad cuenta a todos, también a los niños que no pagan.
    const huespedes = quienes.adultos + quienes.edadesNinos.length;
    const desdeDate = new Date(desde);
    const hastaDate = new Date(hasta);

    if (hastaDate <= desdeDate) {
      throw new BadRequestException('La fecha "hasta" debe ser posterior a "desde"');
    }
    if (desdeDate < fechaDelHotel(this.reloj.ahora())) {
      throw new BadRequestException('No se puede consultar disponibilidad en el pasado');
    }

    const habitaciones = await this.prisma.habitacion.findMany({
      where: {
        hotelId: hotel.id,
        // R26: una habitación fuera de servicio no se ofrece hasta que vuelva.
        estado: { not: 'fuera_servicio' },
        tipoHabitacion: { capacidadMaxima: { gte: huespedes } },
        reservas: {
          none: {
            estado: { in: ['confirmada', 'activa'] },
            // Se solapan si la reserva empieza antes de que termine el rango
            // y termina después de que empiece el rango (intervalo [entrada, salida)).
            fechaEntrada: { lt: hastaDate },
            fechaSalida: { gt: desdeDate },
          },
        },
      },
      include: { tipoHabitacion: true },
      orderBy: { numero: 'asc' },
    });

    return habitaciones.map((h) => ({
      ...h,
      cotizacion: cotizar(
        condicionesDe(h.tipoHabitacion),
        desdeDate,
        hastaDate,
        quienes,
        false,
        reglasDeTarifa(hotel),
      ),
    }));
  }

  // R25/R26: cambios manuales de estado. Solo se puede marcar lista (libre) o
  // sacar / volver a servicio; ocupada y en limpieza las ponen el check-in y
  // el check-out.
  async cambiarEstado(hotelId: string, id: string, nuevo: EstadoManual) {
    const habitacion = await this.prisma.habitacion.findFirst({ where: { id, hotelId } });
    if (!habitacion) {
      throw new NotFoundException('Habitación no encontrada');
    }
    if (habitacion.estado === 'ocupada') {
      throw new BadRequestException(
        `La habitación ${habitacion.numero} tiene un huésped alojado: se libera con el check-out`,
      );
    }

    const actualizada = await this.prisma.habitacion.update({
      where: { id },
      data: { estado: nuevo },
      include: { tipoHabitacion: true },
    });

    // Al sacarla de servicio se avisa cuántas reservas futuras hay que reubicar.
    const reservasAfectadas =
      nuevo === 'fuera_servicio'
        ? await this.prisma.reserva.count({
            where: {
              habitacionId: id,
              estado: 'confirmada',
              fechaSalida: { gt: fechaDelHotel(this.reloj.ahora()) },
            },
          })
        : 0;

    return { ...actualizada, reservasAfectadas };
  }
}
