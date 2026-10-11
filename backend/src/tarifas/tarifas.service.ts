import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TipoHabitacion } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Reloj } from '../hotel/reloj';
import { POLITICAS, fechaDelHotel } from '../hotel/politicas';
import { CondicionesDeTipo } from './motor-tarificacion';
import { periodosDelAnio } from './temporadas';
import { ActualizarTipoHabitacionDto, CrearTipoHabitacionDto } from './tarifas.dto';

const CODIGO_PRISMA_UNICO = 'P2002';

// Convierte el tipo guardado (Decimal) a las condiciones que usa el motor.
export function condicionesDe(tipo: TipoHabitacion): CondicionesDeTipo {
  return {
    tarifaBase: tipo.tarifaBase.toNumber(),
    capacidadIncluida: tipo.capacidadIncluida,
    capacidadMaxima: tipo.capacidadMaxima,
    cargoPersonaAdicional: tipo.cargoPersonaAdicional.toNumber(),
  };
}

function validarCapacidades(incluida: number, maxima: number) {
  if (maxima < incluida) {
    throw new BadRequestException(
      'La capacidad máxima no puede ser menor que la capacidad incluida',
    );
  }
}

@Injectable()
export class TarifasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reloj: Reloj,
  ) {}

  listarTipos() {
    return this.prisma.tipoHabitacion.findMany({
      include: { _count: { select: { habitaciones: true } } },
      orderBy: { tarifaBase: 'asc' },
    });
  }

  async crearTipo(dto: CrearTipoHabitacionDto) {
    validarCapacidades(dto.capacidadIncluida, dto.capacidadMaxima);
    try {
      return await this.prisma.tipoHabitacion.create({ data: dto });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === CODIGO_PRISMA_UNICO
      ) {
        throw new ConflictException(`Ya existe el tipo de habitación "${dto.codigo}"`);
      }
      throw error;
    }
  }

  // Los cambios aplican a las reservas nuevas; las existentes conservan el
  // precio pactado (R5).
  async actualizarTipo(id: string, dto: ActualizarTipoHabitacionDto) {
    const tipo = await this.prisma.tipoHabitacion.findUnique({ where: { id } });
    if (!tipo) {
      throw new NotFoundException('Tipo de habitación no encontrado');
    }
    validarCapacidades(
      dto.capacidadIncluida ?? tipo.capacidadIncluida,
      dto.capacidadMaxima ?? tipo.capacidadMaxima,
    );
    return this.prisma.tipoHabitacion.update({ where: { id }, data: dto });
  }

  // Calendario de temporadas del año (por defecto, el actual del hotel).
  temporadas(anio?: number) {
    const elAnio = anio ?? fechaDelHotel(this.reloj.ahora()).getUTCFullYear();
    return {
      anio: elAnio,
      multiplicadores: POLITICAS.multiplicadorTemporada,
      ivaPorcentaje: POLITICAS.ivaPorcentaje,
      periodos: periodosDelAnio(elAnio),
    };
  }
}
