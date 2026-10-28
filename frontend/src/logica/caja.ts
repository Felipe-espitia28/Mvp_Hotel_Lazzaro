// B-3: cuadre de la caja en pantalla (sin React, para probarlo).

// Diferencia = contado − esperado, y cómo se muestra: verde si cuadra, rojo si no.
export function diferenciaCaja(contado: number | null, esperado: number) {
  if (contado === null) return null;
  const diferencia = Math.round((contado - esperado) * 100) / 100;
  return {
    diferencia,
    tono: diferencia === 0 ? ('cuadra' as const) : ('descuadre' as const),
    texto:
      diferencia === 0
        ? 'La caja cuadra'
        : diferencia > 0
          ? 'Sobra dinero en la caja'
          : 'Falta dinero en la caja',
  };
}

// Lee un monto escrito a mano: "210.000", "210000" o "$ 210.000" → 210000.
export function leerMonto(texto: string): number | null {
  const limpio = texto.replace(/[$\s.]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(limpio)) return null;
  return Number(limpio);
}
