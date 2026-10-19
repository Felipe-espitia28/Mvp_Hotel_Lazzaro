import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActualizarProductoDto, CrearProductoDto } from './productos.dto';

const CODIGO_PRISMA_UNICO = 'P2002';

// Catálogo de consumos del hotel (R22). Cambiar un precio no altera los
// cargos ya hechos: cada cargo copia su concepto y su valor.
@Injectable()
export class ProductosService {
  constructor(private readonly prisma: PrismaService) {}

  listar(hotelId: string) {
    return this.prisma.productoConsumo.findMany({
      where: { hotelId },
      orderBy: [{ activo: 'desc' }, { categoria: 'asc' }, { nombre: 'asc' }],
    });
  }

  async crear(hotelId: string, dto: CrearProductoDto) {
    try {
      return await this.prisma.productoConsumo.create({ data: { ...dto, hotelId } });
    } catch (error) {
      throw this.traducir(error, dto.nombre);
    }
  }

  async actualizar(hotelId: string, id: string, dto: ActualizarProductoDto) {
    await this.buscar(hotelId, id);
    try {
      return await this.prisma.productoConsumo.update({ where: { id }, data: dto });
    } catch (error) {
      throw this.traducir(error, dto.nombre ?? '');
    }
  }

  // Un producto activo del hotel (para cargarlo al folio).
  async activo(hotelId: string, id: string) {
    const producto = await this.prisma.productoConsumo.findFirst({
      where: { id, hotelId, activo: true },
    });
    if (!producto) {
      throw new NotFoundException('Producto no encontrado en el catálogo del hotel');
    }
    return producto;
  }

  private async buscar(hotelId: string, id: string) {
    const producto = await this.prisma.productoConsumo.findFirst({ where: { id, hotelId } });
    if (!producto) {
      throw new NotFoundException('Producto no encontrado');
    }
    return producto;
  }

  private traducir(error: unknown, nombre: string) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === CODIGO_PRISMA_UNICO
    ) {
      return new ConflictException(`Ya existe "${nombre}" en el catálogo`);
    }
    return error;
  }
}
