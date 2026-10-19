import { Hotel, Temporada } from '@prisma/client';
import { ContextoHotel } from '../auth/decoradores';
import { resolverPoliticas } from './politicas';

type RangoGuardado = Pick<Temporada, 'nombre' | 'tipo' | 'desde' | 'hasta'>;

// Lo que hay que leer de un hotel para armar su contexto (solo sus temporadas activas).
export const SELECCION_CONTEXTO = {
  id: true,
  politicas: true,
  temporadas: {
    where: { activa: true },
    select: { nombre: true, tipo: true, desde: true, hasta: true },
    orderBy: { createdAt: 'asc' },
  },
} as const;

// Arma el contexto de un hotel (sus reglas ya resueltas) a partir de lo guardado.
export function contextoDeHotel(
  hotel: Pick<Hotel, 'id' | 'politicas'> & { temporadas: RangoGuardado[] },
): ContextoHotel {
  const politicas = resolverPoliticas(hotel.politicas);
  return {
    id: hotel.id,
    politicas,
    temporadas: {
      rangos: hotel.temporadas.map((t) => ({
        nombre: t.nombre,
        temporada: t.tipo,
        desde: t.desde,
        hasta: t.hasta,
      })),
      semanaSantaAlta: politicas.semanaSantaAlta,
      puentesFestivosMedia: politicas.puentesFestivosMedia,
    },
  };
}
