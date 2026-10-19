// Fechas que se repiten cada año, como número mes·día: 1215 = 15 de diciembre.

export const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

const DIAS_POR_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export const mesDe = (mesDia: number) => Math.floor(mesDia / 100);
export const diaDe = (mesDia: number) => mesDia % 100;
export const aMesDia = (mes: number, dia: number) => mes * 100 + dia;
export const diasDelMes = (mes: number) => DIAS_POR_MES[mes - 1];

// 1215 → "15 dic"
export function formatearMesDia(mesDia: number) {
  return `${diaDe(mesDia)} ${MESES[mesDe(mesDia) - 1].slice(0, 3)}`;
}

// Rango legible; si cruza el fin de año, lo dice.
export function formatearRango(desde: number, hasta: number) {
  const texto = `${formatearMesDia(desde)} → ${formatearMesDia(hasta)}`;
  return desde > hasta ? `${texto} (cruza el año)` : texto;
}
