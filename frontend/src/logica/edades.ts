// Textos de las tarifas por edad (A-3), sin React para poder probarlos.

// "3 y 8", "3, 5 y 8".
const enumerar = (valores: number[]) =>
  valores.length <= 1
    ? valores.join('')
    : `${valores.slice(0, -1).join(', ')} y ${valores[valores.length - 1]}`;

// Ejemplo vivo de los rangos del hotel: "0–4 gratis · 5–11 tarifa de niño · 12+ adulto".
export function resumenRangos(gratisHasta: number, ninoHasta: number) {
  const partes = [`0–${gratisHasta} gratis`];
  if (ninoHasta > gratisHasta) {
    partes.push(
      ninoHasta === gratisHasta + 1
        ? `${ninoHasta} tarifa de niño`
        : `${gratisHasta + 1}–${ninoHasta} tarifa de niño`,
    );
  }
  partes.push(`${ninoHasta + 1}+ adulto`);
  return partes.join(' · ');
}

// Quiénes vienen en una reserva: "2 adultos y 2 niños (3 y 8 años)".
export function resumenHuespedes(adultos: number, edadesNinos: number[]) {
  const deAdultos = `${adultos} ${adultos === 1 ? 'adulto' : 'adultos'}`;
  if (edadesNinos.length === 0) return deAdultos;
  const n = edadesNinos.length;
  const edades = [...edadesNinos].sort((a, b) => a - b);
  return `${deAdultos} y ${n} ${n === 1 ? 'niño' : 'niños'} (${enumerar(edades)} ${
    n === 1 && edades[0] === 1 ? 'año' : 'años'
  })`;
}
