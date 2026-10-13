// Presentación del desglose de tarifa (sin React, para poder probarla).
import type { Desglose, Temporada } from '../api/types';

export interface GrupoDeNoches {
  temporada: Temporada;
  motivo: string | null;
  tarifa: number;
  desde: string; // primera noche del grupo
  noches: number;
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
