import { Hotel } from '@prisma/client';
import { ContextoHotel } from '../auth/decoradores';
import { resolverPoliticas } from './politicas';
import { RANGOS_SUGERIDOS } from '../tarifas/temporadas';

// Arma el contexto de un hotel (sus reglas ya resueltas) a partir de lo guardado.
export function contextoDeHotel(hotel: Pick<Hotel, 'id' | 'politicas'>): ContextoHotel {
  const politicas = resolverPoliticas(hotel.politicas);
  return {
    id: hotel.id,
    politicas,
    temporadas: {
      rangos: RANGOS_SUGERIDOS,
      semanaSantaAlta: politicas.semanaSantaAlta,
      puentesFestivosMedia: politicas.puentesFestivosMedia,
    },
  };
}
