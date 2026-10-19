import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PoliticasHotel, resolverPoliticas } from './politicas';
import { DatosHotelDto } from './hotel.dto';
import { PoliticasDto } from './politicas.dto';

// El hotel tal como lo ve su personal: datos, marca y políticas vigentes.
export const CAMPOS_HOTEL = {
  id: true,
  slug: true,
  nombre: true,
  ciudad: true,
  nit: true,
  telefono: true,
  activo: true,
  eslogan: true,
  logo: true,
  colorPrimario: true,
  colorAcento: true,
  fuenteTitulos: true,
  fuenteTexto: true,
  politicas: true,
} as const;

@Injectable()
export class HotelService {
  constructor(private readonly prisma: PrismaService) {}

  async obtener(hotelId: string) {
    const hotel = await this.prisma.hotel.findUnique({
      where: { id: hotelId },
      select: CAMPOS_HOTEL,
    });
    if (!hotel) {
      throw new NotFoundException('Hotel no encontrado');
    }
    // Las políticas se devuelven completas (con los valores por defecto).
    return { ...hotel, politicas: resolverPoliticas(hotel.politicas) };
  }

  async actualizarDatos(hotelId: string, dto: DatosHotelDto) {
    await this.prisma.hotel.update({ where: { id: hotelId }, data: dto });
    return this.obtener(hotelId);
  }

  // Las reglas nuevas aplican a las reservas que se hagan desde ahora: las
  // existentes conservan su precio y su política de cancelación pactados.
  async actualizarPoliticas(hotelId: string, dto: PoliticasDto) {
    const hotel = await this.obtener(hotelId);
    const politicas: PoliticasHotel = { ...hotel.politicas, ...dto };
    await this.prisma.hotel.update({
      where: { id: hotelId },
      data: { politicas: politicas as unknown as Prisma.InputJsonObject },
    });
    return this.obtener(hotelId);
  }
}
