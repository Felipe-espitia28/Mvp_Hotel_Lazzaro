import { Prisma, PrismaClient } from '@prisma/client';
import { CATEGORIAS_INICIALES } from '../hotel/datos-iniciales';

// S-1: crea el catálogo sugerido (hotel/datos-iniciales.ts). Solo agrega las
// categorías que el hotel aún no tiene (por nombre): no toca lo que ya editó.
// Lo usan la Consola Lazaro al crear un hotel y el seed.
export async function crearCatalogoInicial(
  cliente: PrismaClient | Prisma.TransactionClient,
  hotelId: string,
) {
  const existentes = new Set(
    (
      await cliente.categoriaServicio.findMany({ where: { hotelId }, select: { nombre: true } })
    ).map((c) => c.nombre),
  );
  for (const [indice, { atributos, servicios, ...categoria }] of CATEGORIAS_INICIALES.entries()) {
    if (existentes.has(categoria.nombre)) continue;
    await cliente.categoriaServicio.create({
      data: {
        ...categoria,
        hotelId,
        orden: indice + 1,
        atributos: {
          create: atributos.map((a, orden) => ({ ...a, opciones: [...a.opciones], orden })),
        },
        servicios: { create: servicios.map((s) => ({ ...s, hotelId })) },
      },
    });
  }
}
