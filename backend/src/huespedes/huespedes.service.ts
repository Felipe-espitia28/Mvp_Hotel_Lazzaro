import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TipoDocumento } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normalizarDocumento } from './documento';

export interface DatosHuesped {
  nombre: string;
  tipoDocumento?: TipoDocumento;
  documento: string;
  telefono?: string;
}

const CODIGO_PRISMA_UNICO = 'P2002';
const MAXIMO_RESULTADOS = 20;

@Injectable()
export class HuespedesService {
  constructor(private readonly prisma: PrismaService) {}

  // Reutiliza al huésped si su documento ya está registrado; si no, lo crea.
  // Se conserva el nombre registrado (un error de digitación en el documento
  // no le cambia el nombre a otro cliente); el teléfono sí se actualiza.
  async obtenerOCrear(hotelId: string, datos: DatosHuesped) {
    const tipoDocumento = datos.tipoDocumento ?? 'CC';
    const documento = normalizarDocumento(datos.documento);
    const where = { hotelId_tipoDocumento_documento: { hotelId, tipoDocumento, documento } };
    const cambios = datos.telefono ? { telefono: datos.telefono } : {};

    try {
      return await this.prisma.huesped.upsert({
        where,
        update: cambios,
        create: {
          hotelId,
          nombre: datos.nombre,
          tipoDocumento,
          documento,
          telefono: datos.telefono,
        },
      });
    } catch (error) {
      // Dos reservas simultáneas del mismo huésped nuevo: la otra lo creó
      // primero; se usa ese registro.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === CODIGO_PRISMA_UNICO
      ) {
        return this.prisma.huesped.update({ where, data: cambios });
      }
      throw error;
    }
  }

  // Busca por inicio del documento o por parte del nombre.
  buscar(hotelId: string, texto: string) {
    const termino = texto.trim();
    return this.prisma.huesped.findMany({
      where: {
        hotelId,
        OR: [
          { documento: { startsWith: normalizarDocumento(termino) } },
          { nombre: { contains: termino, mode: 'insensitive' } },
        ],
      },
      include: { _count: { select: { reservas: true } } },
      orderBy: { nombre: 'asc' },
      take: MAXIMO_RESULTADOS,
    });
  }

  async porDocumento(hotelId: string, tipoDocumento: TipoDocumento, documento: string) {
    const huesped = await this.prisma.huesped.findUnique({
      where: {
        hotelId_tipoDocumento_documento: {
          hotelId,
          tipoDocumento,
          documento: normalizarDocumento(documento),
        },
      },
      include: { _count: { select: { reservas: true } } },
    });
    if (!huesped) {
      throw new NotFoundException('No hay un huésped registrado con ese documento');
    }
    return huesped;
  }

  // Ficha del huésped con su historial de estadías, de la más reciente a la más antigua.
  async detalle(hotelId: string, id: string) {
    const huesped = await this.prisma.huesped.findFirst({
      where: { id, hotelId },
      include: {
        reservas: { include: { habitacion: true }, orderBy: { fechaEntrada: 'desc' } },
      },
    });
    if (!huesped) {
      throw new NotFoundException('Huésped no encontrado');
    }
    return huesped;
  }
}
