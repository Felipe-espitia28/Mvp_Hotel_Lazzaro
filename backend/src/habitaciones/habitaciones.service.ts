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
import { cotizar } from '../tarifas/motor-tarificacion';
import { condicionesDe } from '../tarifas/tarifas.service';
import { CrearHabitacionDto } from './dto/crear-habitacion.dto';

// Código de Prisma para violación de una restricción UNIQUE.
const CODIGO_PRISMA_UNICO = 'P2002';

@Injectable()
export class HabitacionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reloj: Reloj,
  ) {}

  listar() {
    return this.prisma.habitacion.findMany({
      include: { tipoHabitacion: true },
      orderBy: { numero: 'asc' },
    });
  }

  async crear(dto: CrearHabitacionDto) {
    const tipo = await this.prisma.tipoHabitacion.findUnique({
      where: { id: dto.tipoHabitacionId },
    });
    if (!tipo) {
      throw new NotFoundException('Tipo de habitación no encontrado');
    }

    try {
      return await this.prisma.habitacion.create({
        data: { numero: dto.numero, tipoHabitacionId: tipo.id },
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
  async disponibles(desde: string, hasta: string, huespedes = 1) {
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
      cotizacion: cotizar(condicionesDe(h.tipoHabitacion), desdeDate, hastaDate, huespedes, false),
    }));
  }
}
