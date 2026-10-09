import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Reloj } from '../hotel/reloj';
import { fechaDelHotel } from '../hotel/politicas';
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
      orderBy: { numero: 'asc' },
    });
  }

  async crear(dto: CrearHabitacionDto) {
    try {
      return await this.prisma.habitacion.create({
        data: {
          numero: dto.numero,
          tipo: dto.tipo,
          tarifaNoche: dto.tarifaNoche,
        },
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

  // Habitaciones sin ninguna reserva confirmada/activa que se solape con [desde, hasta).
  disponibles(desde: string, hasta: string) {
    const desdeDate = new Date(desde);
    const hastaDate = new Date(hasta);

    if (hastaDate <= desdeDate) {
      throw new BadRequestException('La fecha "hasta" debe ser posterior a "desde"');
    }
    if (desdeDate < fechaDelHotel(this.reloj.ahora())) {
      throw new BadRequestException('No se puede consultar disponibilidad en el pasado');
    }

    return this.prisma.habitacion.findMany({
      where: {
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
      orderBy: { numero: 'asc' },
    });
  }
}
