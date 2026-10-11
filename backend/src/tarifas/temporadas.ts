// Temporadas del hotel (R13, R14, R15). Dominio puro.
// Calendario fijo para el MVP; más adelante cada hotel podrá configurarlo.
import { domingoDePascua, festivosDeColombia } from './calendario-colombia';

export type Temporada = 'baja' | 'media' | 'alta';

export interface TemporadaDeNoche {
  temporada: Temporada;
  motivo: string | null;
}

const MS_DIA = 24 * 60 * 60 * 1000;
const masDias = (fecha: Date, dias: number) => new Date(fecha.getTime() + dias * MS_DIA);
const mismoDia = (a: Date, b: Date) => a.getTime() === b.getTime();

// Mes y día como número comparable: 15 de diciembre → 1215.
const mesDia = (fecha: Date) => (fecha.getUTCMonth() + 1) * 100 + fecha.getUTCDate();

// La temporada se decide por la NOCHE: la del día D es la que va de D a D+1.
// Prioridad: alta > media > baja.
export function temporadaDeNoche(noche: Date): TemporadaDeNoche {
  const md = mesDia(noche);
  if (md >= 1215 || md <= 115) {
    return { temporada: 'alta', motivo: 'Temporada de fin de año' };
  }
  if (md >= 615 && md <= 715) {
    return { temporada: 'alta', motivo: 'Vacaciones de mitad de año' };
  }

  // Semana Santa: de la noche del Domingo de Ramos a la del Sábado Santo.
  const pascua = domingoDePascua(noche.getUTCFullYear());
  if (noche >= masDias(pascua, -7) && noche < pascua) {
    return { temporada: 'alta', motivo: 'Semana Santa' };
  }

  // Puente festivo: la noche anterior a un festivo y, si el festivo cae en
  // lunes, también las noches de viernes y sábado de ese fin de semana.
  // (Se miran también los festivos del año siguiente por las noches de fin de año.)
  const anio = noche.getUTCFullYear();
  for (const festivo of [...festivosDeColombia(anio), ...festivosDeColombia(anio + 1)]) {
    const esLunes = festivo.fecha.getUTCDay() === 1;
    const nochesDelPuente = esLunes ? [-3, -2, -1] : [-1];
    if (nochesDelPuente.some((n) => mismoDia(masDias(festivo.fecha, n), noche))) {
      return { temporada: 'media', motivo: `Puente festivo: ${festivo.nombre}` };
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
export function periodosDelAnio(anio: number): PeriodoDeTemporada[] {
  const periodos: PeriodoDeTemporada[] = [];
  for (
    let noche = new Date(Date.UTC(anio, 0, 1));
    noche.getUTCFullYear() === anio;
    noche = masDias(noche, 1)
  ) {
    const { temporada, motivo } = temporadaDeNoche(noche);
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
