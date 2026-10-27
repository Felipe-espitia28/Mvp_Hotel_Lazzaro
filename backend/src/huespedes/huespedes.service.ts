import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TipoDocumento } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normalizarDocumento } from './documento';
import { DatosPersona, combinarPersona } from './datos-legales';

const MAXIMO_RESULTADOS = 20;

@Injectable()
export class HuespedesService {
  constructor(private readonly prisma: PrismaService) {}

  // Reutiliza al huésped si su documento ya está registrado; si no, lo crea.
  // Qué datos se conservan y cuáles se completan: combinarPersona (R36, R46).
  // Recibe el cliente de la transacción cuando se llama dentro de una (check-in).
  async obtenerOCrear(
    hotelId: string,
    datos: DatosPersona,
    cliente: Prisma.TransactionClient = this.prisma,
  ) {
    const tipoDocumento: TipoDocumento = datos.tipoDocumento ?? 'CC';
    const documento = normalizarDocumento(datos.documento);
    const where = { hotelId_tipoDocumento_documento: { hotelId, tipoDocumento, documento } };
    const datosNormalizados = { ...datos, tipoDocumento, documento };

    // Dos reservas o check-in simultáneos con el mismo huésped nuevo: ON
    // CONFLICT DO NOTHING espera a la otra transacción y no falla (un error de
    // unicidad abortaría la transacción entera del check-in); luego se lee el
    // registro que quedó, sea el propio o el de la otra.
    await cliente.huesped.createMany({
      data: [{ hotelId, ...combinarPersona(null, datosNormalizados) }],
      skipDuplicates: true,
    });
    const existente = await cliente.huesped.findUniqueOrThrow({ where });
    return cliente.huesped.update({
      where,
      data: combinarPersona(existente, datosNormalizados),
    });
  }

  // Huéspedes ya registrados con alguno de estos documentos (para validar el
  // check-in con los datos que el hotel ya tiene).
  registrados(hotelId: string, documentos: { tipoDocumento: TipoDocumento; documento: string }[]) {
    return this.prisma.huesped.findMany({
      where: {
        hotelId,
        OR: documentos.map((d) => ({
          tipoDocumento: d.tipoDocumento,
          documento: normalizarDocumento(d.documento),
        })),
      },
    });
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
