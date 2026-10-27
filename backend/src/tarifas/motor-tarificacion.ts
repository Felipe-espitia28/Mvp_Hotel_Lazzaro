// Motor de tarificación (R12–R17, A-3). Dominio puro: recibe el tipo de
// habitación, las fechas, los adultos y la edad de cada niño, y las reglas de
// precio del hotel, y devuelve el
// precio desglosado noche por noche. El resultado se congela en la reserva (R5).
import { POLITICAS_POR_DEFECTO } from '../hotel/politicas';
import {
  ConfiguracionTemporadas,
  TEMPORADAS_POR_DEFECTO,
  Temporada,
  temporadaDeNoche,
} from './temporadas';

// A-3: hasta qué edad (cumplida a la fecha de entrada) un niño no paga y
// hasta cuál paga tarifa de niño; desde ahí paga como adulto.
export interface RangosEdad {
  gratisHasta: number;
  ninoHasta: number;
}

// Lo que cada hotel decide sobre sus precios.
export interface ReglasDeTarifa {
  multiplicadorTemporada: Record<Temporada, number>;
  ivaPorcentaje: number;
  temporadas: ConfiguracionTemporadas;
  rangosEdad: RangosEdad;
}

export const REGLAS_POR_DEFECTO: ReglasDeTarifa = {
  multiplicadorTemporada: POLITICAS_POR_DEFECTO.multiplicadorTemporada,
  ivaPorcentaje: POLITICAS_POR_DEFECTO.ivaPorcentaje,
  temporadas: TEMPORADAS_POR_DEFECTO,
  rangosEdad: {
    gratisHasta: POLITICAS_POR_DEFECTO.edadMaximaNinoGratis,
    ninoHasta: POLITICAS_POR_DEFECTO.edadMaximaNino,
  },
};

export interface CondicionesDeTipo {
  tarifaBase: number; // por noche, en temporada baja
  capacidadIncluida: number; // adultos incluidos en la tarifa
  capacidadMaxima: number; // todos: adultos y niños (también los gratis)
  cargoPersonaAdicional: number; // por adulto adicional y por noche
  cargoNinoAdicional: number; // por niño con cargo y por noche
}

// Quiénes se alojan: los adultos y la edad de cada niño a la fecha de entrada.
export interface Huespedes {
  adultos: number;
  edadesNinos: number[];
}

export interface NocheCotizada {
  fecha: string; // YYYY-MM-DD
  temporada: Temporada;
  motivo: string | null;
  tarifa: number;
}

// Los campos de niños no existen en los desgloses congelados antes de A-3:
// quien los lea los trata como 0 (ver cargoNinosPorNoche).
export interface Desglose {
  noches: NocheCotizada[];
  huespedes: number; // todos
  adultos?: number; // los que pagan como adultos
  ninos?: { gratis: number; conCargo: number };
  rangosEdad?: RangosEdad; // los del hotel al cotizar: quedan pactados
  personasAdicionales: number; // adultos sobre la capacidad incluida
  cargoPersonaAdicionalPorNoche: number;
  cargoNinoPorNoche?: number;
  alojamiento: number; // suma de las tarifas por noche
  adicionales: number; // personas adicionales × cargo × noches
  ninosAdicionales?: number; // niños con cargo × cargo × noches
  subtotal: number;
  iva: { porcentaje: number; valor: number; exento: boolean };
  total: number;
}

const MS_DIA = 24 * 60 * 60 * 1000;

// Pesos colombianos: los montos se redondean al peso.
const pesos = (valor: number) => Math.round(valor);

export class CapacidadExcedidaError extends Error {}

// A-3: cuántos pagan como adultos y cuántos niños son gratis o con cargo. Un
// "niño" mayor que el rango de niño paga como adulto.
export function clasificarEdades({ adultos, edadesNinos }: Huespedes, rangos: RangosEdad) {
  const gratis = edadesNinos.filter((e) => e <= rangos.gratisHasta).length;
  const conCargo = edadesNinos.filter(
    (e) => e > rangos.gratisHasta && e <= rangos.ninoHasta,
  ).length;
  return { adultos: adultos + edadesNinos.length - gratis - conCargo, gratis, conCargo };
}

// A-3: las edades que cuentan como niño para el precio (gratis o con cargo),
// ordenadas. El check-in compara las declaradas con las registradas.
export const edadesDeNino = (edades: number[], rangos: RangosEdad) =>
  edades.filter((e) => e <= rangos.ninoHasta).sort((a, b) => a - b);

// Cargo de los niños por noche (0 en los desgloses anteriores a A-3).
const cargoNinosPorNoche = (d: Desglose) => (d.ninos?.conCargo ?? 0) * (d.cargoNinoPorNoche ?? 0);

export function cotizar(
  tipo: CondicionesDeTipo,
  fechaEntrada: Date,
  fechaSalida: Date,
  quienes: Huespedes,
  exentoIva: boolean,
  reglas: ReglasDeTarifa = REGLAS_POR_DEFECTO,
): Desglose {
  // R6: la capacidad máxima cuenta a todos, también a los niños que no pagan.
  const huespedes = quienes.adultos + quienes.edadesNinos.length;
  if (huespedes > tipo.capacidadMaxima) {
    throw new CapacidadExcedidaError(
      `La habitación admite máximo ${tipo.capacidadMaxima} huéspedes`,
    );
  }

  const noches: NocheCotizada[] = [];
  for (let t = fechaEntrada.getTime(); t < fechaSalida.getTime(); t += MS_DIA) {
    const noche = new Date(t);
    const { temporada, motivo } = temporadaDeNoche(noche, reglas.temporadas);
    noches.push({
      fecha: noche.toISOString().slice(0, 10),
      temporada,
      motivo,
      tarifa: pesos(tipo.tarifaBase * reglas.multiplicadorTemporada[temporada]),
    });
  }

  // A-3: la capacidad incluida cuenta adultos; los niños con cargo siempre
  // pagan el suyo (no ocupan un cupo incluido) y los gratis no pagan.
  const { adultos, gratis, conCargo } = clasificarEdades(quienes, reglas.rangosEdad);
  const personasAdicionales = Math.max(0, adultos - tipo.capacidadIncluida);
  const alojamiento = noches.reduce((suma, n) => suma + n.tarifa, 0);
  const adicionales = personasAdicionales * tipo.cargoPersonaAdicional * noches.length;
  const ninosAdicionales = conCargo * tipo.cargoNinoAdicional * noches.length;
  const subtotal = alojamiento + adicionales + ninosAdicionales;
  const porcentaje = exentoIva ? 0 : reglas.ivaPorcentaje;
  const iva = pesos((subtotal * porcentaje) / 100);

  return {
    noches,
    huespedes,
    adultos,
    ninos: { gratis, conCargo },
    rangosEdad: reglas.rangosEdad,
    personasAdicionales,
    cargoPersonaAdicionalPorNoche: tipo.cargoPersonaAdicional,
    cargoNinoPorNoche: tipo.cargoNinoAdicional,
    alojamiento,
    adicionales,
    ninosAdicionales,
    subtotal,
    iva: { porcentaje, valor: iva, exento: exentoIva },
    total: subtotal + iva,
  };
}

// R24: salida anticipada. Conserva solo las primeras `nochesUsadas` noches del
// desglose pactado (con sus tarifas de temporada) y recalcula adicionales,
// niños e IVA con las mismas condiciones.
export function recortarDesglose(desglose: Desglose, nochesUsadas: number): Desglose {
  const noches = desglose.noches.slice(0, nochesUsadas);
  const alojamiento = noches.reduce((suma, n) => suma + n.tarifa, 0);
  const adicionales =
    desglose.personasAdicionales * desglose.cargoPersonaAdicionalPorNoche * noches.length;
  const ninosAdicionales = cargoNinosPorNoche(desglose) * noches.length;
  const subtotal = alojamiento + adicionales + ninosAdicionales;
  const iva = pesos((subtotal * desglose.iva.porcentaje) / 100);
  return {
    ...desglose,
    noches,
    alojamiento,
    adicionales,
    // Un desglose antiguo sigue sin el campo, como fue pactado.
    ...(desglose.ninosAdicionales !== undefined && { ninosAdicionales }),
    subtotal,
    iva: { ...desglose.iva, valor: iva },
    total: subtotal + iva,
  };
}

// R9/R10: la penalidad es el valor de la primera noche (con sus adicionales,
// niños e IVA).
export function valorPrimeraNoche(desglose: Desglose) {
  const primera =
    desglose.noches[0].tarifa +
    desglose.personasAdicionales * desglose.cargoPersonaAdicionalPorNoche +
    cargoNinosPorNoche(desglose);
  return pesos(primera * (1 + desglose.iva.porcentaje / 100));
}
