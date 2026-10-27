// Edad cumplida en una fecha (fechas de calendario, en UTC como las guarda
// Prisma para @db.Date). Quien nació un 29 de febrero cumple años el 1 de
// marzo en los años no bisiestos.
export function edadEn(fechaNacimiento: Date, fecha: Date) {
  const edad = fecha.getUTCFullYear() - fechaNacimiento.getUTCFullYear();
  const meses = fecha.getUTCMonth() - fechaNacimiento.getUTCMonth();
  const aunNoCumple =
    meses < 0 || (meses === 0 && fecha.getUTCDate() < fechaNacimiento.getUTCDate());
  return aunNoCumple ? edad - 1 : edad;
}

// R44: menor de edad según la ley colombiana.
export const MAYORIA_DE_EDAD = 18;
