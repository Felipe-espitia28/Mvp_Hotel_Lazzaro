// Motor de tarificación (R12–R17). Dominio puro: recibe el tipo de habitación,
// las fechas y los huéspedes y devuelve el precio desglosado noche por noche.
// El resultado se congela en la reserva (R5).
import { POLITICAS } from '../hotel/politicas';
import { Temporada, temporadaDeNoche } from './temporadas';

export interface CondicionesDeTipo {
  tarifaBase: number; // por noche, en temporada baja
  capacidadIncluida: number; // huéspedes incluidos en la tarifa
  capacidadMaxima: number;
  cargoPersonaAdicional: number; // por persona adicional y por noche
}

export interface NocheCotizada {
  fecha: string; // YYYY-MM-DD
  temporada: Temporada;
  motivo: string | null;
  tarifa: number;
}

export interface Desglose {
  noches: NocheCotizada[];
  huespedes: number;
  personasAdicionales: number;
  cargoPersonaAdicionalPorNoche: number;
  alojamiento: number; // suma de las tarifas por noche
  adicionales: number; // personas adicionales × cargo × noches
  subtotal: number;
  iva: { porcentaje: number; valor: number; exento: boolean };
  total: number;
}

const MS_DIA = 24 * 60 * 60 * 1000;

// Pesos colombianos: los montos se redondean al peso.
const pesos = (valor: number) => Math.round(valor);

export class CapacidadExcedidaError extends Error {}

export function cotizar(
  tipo: CondicionesDeTipo,
  fechaEntrada: Date,
  fechaSalida: Date,
  huespedes: number,
  exentoIva: boolean,
): Desglose {
  if (huespedes > tipo.capacidadMaxima) {
    throw new CapacidadExcedidaError(
      `La habitación admite máximo ${tipo.capacidadMaxima} huéspedes`,
    );
  }

  const noches: NocheCotizada[] = [];
  for (let t = fechaEntrada.getTime(); t < fechaSalida.getTime(); t += MS_DIA) {
    const noche = new Date(t);
    const { temporada, motivo } = temporadaDeNoche(noche);
    noches.push({
      fecha: noche.toISOString().slice(0, 10),
      temporada,
      motivo,
      tarifa: pesos(tipo.tarifaBase * POLITICAS.multiplicadorTemporada[temporada]),
    });
  }

  const personasAdicionales = Math.max(0, huespedes - tipo.capacidadIncluida);
  const alojamiento = noches.reduce((suma, n) => suma + n.tarifa, 0);
  const adicionales = personasAdicionales * tipo.cargoPersonaAdicional * noches.length;
  const subtotal = alojamiento + adicionales;
  const porcentaje = exentoIva ? 0 : POLITICAS.ivaPorcentaje;
  const iva = pesos((subtotal * porcentaje) / 100);

  return {
    noches,
    huespedes,
    personasAdicionales,
    cargoPersonaAdicionalPorNoche: tipo.cargoPersonaAdicional,
    alojamiento,
    adicionales,
    subtotal,
    iva: { porcentaje, valor: iva, exento: exentoIva },
    total: subtotal + iva,
  };
}

// R24: salida anticipada. Conserva solo las primeras `nochesUsadas` noches del
// desglose pactado (con sus tarifas de temporada) y recalcula adicionales e IVA
// con las mismas condiciones.
export function recortarDesglose(desglose: Desglose, nochesUsadas: number): Desglose {
  const noches = desglose.noches.slice(0, nochesUsadas);
  const alojamiento = noches.reduce((suma, n) => suma + n.tarifa, 0);
  const adicionales =
    desglose.personasAdicionales * desglose.cargoPersonaAdicionalPorNoche * noches.length;
  const subtotal = alojamiento + adicionales;
  const iva = pesos((subtotal * desglose.iva.porcentaje) / 100);
  return {
    ...desglose,
    noches,
    alojamiento,
    adicionales,
    subtotal,
    iva: { ...desglose.iva, valor: iva },
    total: subtotal + iva,
  };
}

// R9/R10: la penalidad es el valor de la primera noche (con sus adicionales e IVA).
export function valorPrimeraNoche(desglose: Desglose) {
  const primera =
    desglose.noches[0].tarifa +
    desglose.personasAdicionales * desglose.cargoPersonaAdicionalPorNoche;
  return pesos(primera * (1 + desglose.iva.porcentaje / 100));
}
