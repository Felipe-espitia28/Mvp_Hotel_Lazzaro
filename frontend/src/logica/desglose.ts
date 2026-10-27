// Presentación del desglose de tarifa (sin React, para poder probarla).
import type { Desglose, Temporada } from '../api/types';

export interface GrupoDeNoches {
  temporada: Temporada;
  motivo: string | null;
  tarifa: number;
  desde: string; // primera noche del grupo
  noches: number;
}

export interface LineaDeHuespedes {
  concepto: string;
  unitario: number | null; // por noche (null = sin cargo)
  valor: number;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

// A-3: las líneas de la cuenta por las personas: adultos adicionales, niños
// gratis y niños con cargo. Un desglose anterior a A-3 no trae los campos de
// niños: cuentan como 0.
export function lineasDeHuespedes(desglose: Desglose): LineaDeHuespedes[] {
  const noches = plural(desglose.noches.length, 'noche', 'noches');
  const lineas: LineaDeHuespedes[] = [];
  if (desglose.personasAdicionales > 0) {
    lineas.push({
      concepto: `${plural(desglose.personasAdicionales, 'persona adicional', 'personas adicionales')} × ${noches}`,
      unitario: desglose.cargoPersonaAdicionalPorNoche,
      valor: desglose.adicionales,
    });
  }
  const gratis = desglose.ninos?.gratis ?? 0;
  if (gratis > 0) {
    lineas.push({
      concepto: plural(gratis, 'niño gratis', 'niños gratis'),
      unitario: null,
      valor: 0,
    });
  }
  const conCargo = desglose.ninos?.conCargo ?? 0;
  if (conCargo > 0) {
    lineas.push({
      concepto: `${plural(conCargo, 'niño', 'niños')} × ${noches}`,
      unitario: desglose.cargoNinoPorNoche ?? 0,
      valor: desglose.ninosAdicionales ?? 0,
    });
  }
  return lineas;
}

// Agrupa noches consecutivas con la misma tarifa y motivo, para mostrarlas
// como una línea de cuenta: "2 noches · temporada media × $149.500".
export function agruparNoches(desglose: Desglose): GrupoDeNoches[] {
  const grupos: GrupoDeNoches[] = [];
  for (const n of desglose.noches) {
    const ultimo = grupos.at(-1);
    if (ultimo && ultimo.tarifa === n.tarifa && ultimo.motivo === n.motivo) {
      ultimo.noches += 1;
    } else {
      grupos.push({
        temporada: n.temporada,
        motivo: n.motivo,
        tarifa: n.tarifa,
        desde: n.fecha,
        noches: 1,
      });
    }
  }
  return grupos;
}
