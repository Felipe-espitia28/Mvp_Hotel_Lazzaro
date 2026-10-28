import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UsuarioAutenticado } from '../auth/decoradores';
import { reservasFuturas } from '../habitaciones/reglas-habitacion';
import { fechaDelHotel } from '../hotel/politicas';
import { Reloj } from '../hotel/reloj';
import { PrismaService } from '../prisma/prisma.service';
import { ReportarIncidenciaDto } from './limpieza.dto';

const DETALLE_INCIDENCIA = {
  habitacion: { select: { id: true, numero: true, estado: true } },
  reportadaPor: { select: { nombre: true } },
  resueltaPor: { select: { nombre: true } },
} as const;

// B-4: daños reportados por cualquiera del hotel (la camarera incluida). Si
// la incidencia saca la habitación de servicio, se avisa de las reservas
// futuras como al sacarla a mano (R26). Resolverla no la devuelve a libre:
// eso lo decide quien maneja los estados de las habitaciones.
@Injectable()
export class IncidenciasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reloj: Reloj,
  ) {}

  listar(hotelId: string, estado?: 'abierta' | 'resuelta') {
    return this.prisma.incidencia.findMany({
      where: { hotelId, ...(estado && { estado }) },
      include: DETALLE_INCIDENCIA,
      orderBy: { creadaEn: 'desc' },
    });
  }

  async reportar(hotelId: string, dto: ReportarIncidenciaDto, quien: UsuarioAutenticado) {
    return this.prisma.$transaction(async (tx) => {
      const habitacion = await tx.habitacion.findFirst({
        where: { id: dto.habitacionId, hotelId },
      });
      if (!habitacion) throw new NotFoundException('Habitación no encontrada');
      const ahora = this.reloj.ahora();

      let reservasAfectadas = 0;
      if (dto.sacaDeServicio) {
        // Con un huésped alojado no se saca de servicio: primero hay que moverlo.
        const { count } = await tx.habitacion.updateMany({
          where: { id: habitacion.id, estado: { not: 'ocupada' } },
          data: { estado: 'fuera_servicio' },
        });
        if (count === 0) {
          throw new BadRequestException(
            `La habitación ${habitacion.numero} tiene un huésped alojado: repórtala sin sacarla de servicio o cámbialo de habitación`,
          );
        }
        reservasAfectadas =
          (await reservasFuturas(tx, [habitacion], fechaDelHotel(ahora)))[0]?.reservas ?? 0;
      }

      const incidencia = await tx.incidencia.create({
        data: {
          hotelId,
          habitacionId: habitacion.id,
          descripcion: dto.descripcion.trim(),
          prioridad: dto.prioridad,
          sacaDeServicio: dto.sacaDeServicio,
          reportadaPorId: quien.id,
          creadaEn: ahora,
        },
        include: DETALLE_INCIDENCIA,
      });
      return { ...incidencia, reservasAfectadas };
    });
  }

  async resolver(
    hotelId: string,
    id: string,
    solucion: string | undefined,
    quien: UsuarioAutenticado,
  ) {
    const { count } = await this.prisma.incidencia.updateMany({
      where: { id, hotelId, estado: 'abierta' },
      data: {
        estado: 'resuelta',
        resueltaPorId: quien.id,
        resueltaEn: this.reloj.ahora(),
        solucion: solucion?.trim() || null,
      },
    });
    if (count === 0) {
      const existe = await this.prisma.incidencia.findFirst({ where: { id, hotelId } });
      if (!existe) throw new NotFoundException('Incidencia no encontrada');
      throw new ConflictException('La incidencia ya está resuelta');
    }
    return this.prisma.incidencia.findUniqueOrThrow({ where: { id }, include: DETALLE_INCIDENCIA });
  }
}
