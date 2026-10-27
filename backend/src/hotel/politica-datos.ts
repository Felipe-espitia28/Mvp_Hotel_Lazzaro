import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TEXTO_POLITICA_DATOS_POR_DEFECTO } from './datos-iniciales';

const CODIGO_PRISMA_UNICO = 'P2002';
const esUnicoRepetido = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === CODIGO_PRISMA_UNICO;

// R45 (Ley 1581): política de tratamiento de datos de cada hotel. Las
// versiones no se editan; la vigente es la más reciente.
@Injectable()
export class PoliticaDatosService {
  constructor(private readonly prisma: PrismaService) {}

  // Un hotel que aún no escribió su política usa el texto por defecto: se
  // guarda como su versión 1 la primera vez que se necesita, para que cada
  // aceptación apunte a un texto concreto.
  async vigente(hotelId: string, cliente: Prisma.TransactionClient = this.prisma) {
    const ultima = await cliente.politicaDatos.findFirst({
      where: { hotelId },
      orderBy: { version: 'desc' },
    });
    if (ultima) {
      return ultima;
    }
    // ON CONFLICT DO NOTHING: si dos check-in la crean a la vez, no falla
    // (dentro de una transacción, un error de unicidad la abortaría).
    await cliente.politicaDatos.createMany({
      data: [{ hotelId, version: 1, texto: TEXTO_POLITICA_DATOS_POR_DEFECTO }],
      skipDuplicates: true,
    });
    return cliente.politicaDatos.findFirstOrThrow({
      where: { hotelId },
      orderBy: { version: 'desc' },
    });
  }

  // Cada cambio crea una versión nueva: lo que ya aceptaron los huéspedes no se altera.
  async nuevaVersion(hotelId: string, texto: string) {
    const actual = await this.vigente(hotelId);
    try {
      return await this.prisma.politicaDatos.create({
        data: { hotelId, version: actual.version + 1, texto: texto.trim() },
      });
    } catch (error) {
      if (esUnicoRepetido(error)) {
        throw new ConflictException(
          'Otra persona acaba de cambiar la política: recarga e intenta de nuevo',
        );
      }
      throw error;
    }
  }
}
