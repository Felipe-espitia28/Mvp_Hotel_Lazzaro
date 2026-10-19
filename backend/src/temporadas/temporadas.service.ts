import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActualizarTemporadaDto, CrearTemporadaDto } from './temporadas.dto';

// Temporadas propias del hotel (R13–R15). Cambiarlas cambia el precio de las
// reservas nuevas; las existentes conservan su desglose pactado (R5).
@Injectable()
export class TemporadasService {
  constructor(private readonly prisma: PrismaService) {}

  listar(hotelId: string) {
    return this.prisma.temporada.findMany({
      where: { hotelId },
      orderBy: [{ tipo: 'asc' }, { desde: 'asc' }],
    });
  }

  crear(hotelId: string, dto: CrearTemporadaDto) {
    return this.prisma.temporada.create({ data: { ...dto, hotelId } });
  }

  async actualizar(hotelId: string, id: string, dto: ActualizarTemporadaDto) {
    await this.buscar(hotelId, id);
    return this.prisma.temporada.update({ where: { id }, data: dto });
  }

  async eliminar(hotelId: string, id: string) {
    await this.buscar(hotelId, id);
    await this.prisma.temporada.delete({ where: { id } });
  }

  private async buscar(hotelId: string, id: string) {
    const temporada = await this.prisma.temporada.findFirst({ where: { id, hotelId } });
    if (!temporada) {
      throw new NotFoundException('Temporada no encontrada');
    }
    return temporada;
  }
}
