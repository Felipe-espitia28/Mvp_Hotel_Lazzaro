import { createContext, useContext } from 'react';
import type { Hotel } from '../api/types';

// El hotel de quien usa la app (marca, datos y reglas), cargado al entrar.
// recargar() lo vuelve a pedir después de que la Gerencia lo cambia.
interface ValorHotel {
  hotel: Hotel | null;
  recargar: () => Promise<void>;
}

export const HotelContexto = createContext<ValorHotel>({
  hotel: null,
  recargar: async () => {},
});

export const useHotel = () => useContext(HotelContexto);
