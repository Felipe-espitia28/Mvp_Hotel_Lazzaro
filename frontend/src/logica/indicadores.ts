// B-1: ayudantes de la vista de gerencia (sin React, para probarlos).
import { sumarDias } from './calendario';

export type PeriodoRapido = 'este_mes' | 'mes_anterior' | 'ultimos_30';

export const ETIQUETA_PERIODO: Record<PeriodoRapido, string> = {
  este_mes: 'Este mes',
  mes_anterior: 'Mes anterior',
  ultimos_30: 'Últimos 30 días',
};

const dia = (fecha: Date) => fecha.toISOString().slice(0, 10);

// Primer y último día (incluidos, YYYY-MM-DD) de un período rápido, contado
// desde hoy (YYYY-MM-DD, la fecha del hotel).
export function periodo(tipo: PeriodoRapido, hoy: string): { desde: string; hasta: string } {
  const [anio, mes] = hoy.split('-').map(Number);
  if (tipo === 'ultimos_30') return { desde: sumarDias(hoy, -29), hasta: hoy };
  const desplazamiento = tipo === 'mes_anterior' ? -1 : 0;
  return {
    desde: dia(new Date(Date.UTC(anio, mes - 1 + desplazamiento, 1))),
    hasta: dia(new Date(Date.UTC(anio, mes + desplazamiento, 0))),
  };
}

// "▲ 12,5 %" / "▼ 3 %" / "= 0 %" frente al período anterior; sin dato anterior,
// "Sin datos del período anterior".
export function textoVariacion(variacion: number | null) {
  if (variacion === null) return { texto: 'Sin datos del período anterior', tono: 'neutro' };
  const valor = `${Math.abs(variacion).toLocaleString('es-CO')} %`;
  if (variacion > 0) return { texto: `▲ ${valor}`, tono: 'sube' };
  if (variacion < 0) return { texto: `▼ ${valor}`, tono: 'baja' };
  return { texto: `= ${valor}`, tono: 'neutro' };
}
