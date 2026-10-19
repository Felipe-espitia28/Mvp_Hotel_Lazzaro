// Temporadas del hotel (R13, R14, R15). Dominio puro.
// Cada hotel define sus rangos de temporada alta y media; además puede activar
// las temporadas que se calculan para Colombia (Semana Santa y puentes).
import { domingoDePascua, festivosDeColombia } from './calendario-colombia';

export type Temporada = 'baja' | 'media' | 'alta';

export interface TemporadaDeNoche {
  temporada: Temporada;
  motivo: string | null;
}

// Rango que se repite cada año, en mes y día como número: 15 de diciembre →
// 1215. Si `desde` es mayor que `hasta`, el rango cruza el fin de año
// (p. ej. 1215 → 115).
export interface RangoTemporada {
  nombre: string;
  temporada: Exclude<Temporada, 'baja'>;
  desde: number;
  hasta: number;
}

export interface ConfiguracionTemporadas {
  rangos: RangoTemporada[];
  semanaSantaAlta: boolean;
  puentesFestivosMedia: boolean;
}

// Calendario sugerido para Colombia (con él nace cada hotel; luego lo edita).
export const RANGOS_SUGERIDOS: RangoTemporada[] = [
  { nombre: 'Temporada de fin de año', temporada: 'alta', desde: 1215, hasta: 115 },
  { nombre: 'Vacaciones de mitad de año', temporada: 'alta', desde: 615, hasta: 715 },
];

export const TEMPORADAS_POR_DEFECTO: ConfiguracionTemporadas = {
  rangos: RANGOS_SUGERIDOS,
  semanaSantaAlta: true,
  puentesFestivosMedia: true,
};

const MS_DIA = 24 * 60 * 60 * 1000;
const masDias = (fecha: Date, dias: number) => new Date(fecha.getTime() + dias * MS_DIA);
const mismoDia = (a: Date, b: Date) => a.getTime() === b.getTime();

// Mes y día como número comparable: 15 de diciembre → 1215.
const mesDia = (fecha: Date) => (fecha.getUTCMonth() + 1) * 100 + fecha.getUTCDate();

export function dentroDelRango(md: number, rango: Pick<RangoTemporada, 'desde' | 'hasta'>) {
  return rango.desde <= rango.hasta
    ? md >= rango.desde && md <= rango.hasta
    : md >= rango.desde || md <= rango.hasta;
}

// La temporada se decide por la NOCHE: la del día D es la que va de D a D+1.
// Prioridad: alta > media > baja (rangos del hotel antes que los calculados).
export function temporadaDeNoche(
  noche: Date,
  config: ConfiguracionTemporadas = TEMPORADAS_POR_DEFECTO,
): TemporadaDeNoche {
  const md = mesDia(noche);
  const rangoDe = (temporada: RangoTemporada['temporada']) =>
    config.rangos.find((r) => r.temporada === temporada && dentroDelRango(md, r));

  const alta = rangoDe('alta');
  if (alta) {
    return { temporada: 'alta', motivo: alta.nombre };
  }

  // Semana Santa: de la noche del Domingo de Ramos a la del Sábado Santo.
  if (config.semanaSantaAlta) {
    const pascua = domingoDePascua(noche.getUTCFullYear());
    if (noche >= masDias(pascua, -7) && noche < pascua) {
      return { temporada: 'alta', motivo: 'Semana Santa' };
    }
  }

  const media = rangoDe('media');
  if (media) {
    return { temporada: 'media', motivo: media.nombre };
  }

  // Puente festivo: la noche anterior a un festivo y, si el festivo cae en
  // lunes, también las noches de viernes y sábado de ese fin de semana.
  // (Se miran también los festivos del año siguiente por las noches de fin de año.)
  if (config.puentesFestivosMedia) {
    const anio = noche.getUTCFullYear();
    for (const festivo of [...festivosDeColombia(anio), ...festivosDeColombia(anio + 1)]) {
      const esLunes = festivo.fecha.getUTCDay() === 1;
      const nochesDelPuente = esLunes ? [-3, -2, -1] : [-1];
      if (nochesDelPuente.some((n) => mismoDia(masDias(festivo.fecha, n), noche))) {
        return { temporada: 'media', motivo: `Puente festivo: ${festivo.nombre}` };
      }
    }
  }

  return { temporada: 'baja', motivo: null };
}

export interface PeriodoDeTemporada extends TemporadaDeNoche {
  desde: Date; // primera noche
  hasta: Date; // última noche (inclusive)
}

// Calendario de temporadas de un año, agrupando noches consecutivas iguales.
// Solo devuelve los periodos de temporada media y alta (el resto es baja).
export function periodosDelAnio(
  anio: number,
  config: ConfiguracionTemporadas = TEMPORADAS_POR_DEFECTO,
): PeriodoDeTemporada[] {
  const periodos: PeriodoDeTemporada[] = [];
  for (
    let noche = new Date(Date.UTC(anio, 0, 1));
    noche.getUTCFullYear() === anio;
    noche = masDias(noche, 1)
  ) {
    const { temporada, motivo } = temporadaDeNoche(noche, config);
    if (temporada === 'baja') continue;
    const ultimo = periodos.at(-1);
    if (ultimo && ultimo.motivo === motivo && mismoDia(masDias(ultimo.hasta, 1), noche)) {
      ultimo.hasta = noche;
    } else {
      periodos.push({ temporada, motivo, desde: noche, hasta: noche });
    }
  }
  return periodos;
}
