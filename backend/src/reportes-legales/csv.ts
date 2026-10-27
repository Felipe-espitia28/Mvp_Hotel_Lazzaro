// A-6: archivos CSV para las plataformas oficiales. UTF-8 con BOM (así Excel
// reconoce las tildes) y separador ";" (el que usa Excel con la configuración
// regional de Colombia). Sin NestJS ni Prisma: se prueba sin base de datos.

export interface Columna<T> {
  clave: keyof T & string;
  encabezado: string;
}

const BOM = '\uFEFF';
const SEPARADOR = ';';

// Entre comillas solo si el valor trae el separador, comillas o un salto de
// línea; las comillas internas se duplican.
function celda(valor: unknown) {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  return /[;"\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export function aCsv<T>(columnas: Columna<T>[], filas: T[]) {
  const lineas = [
    columnas.map((c) => celda(c.encabezado)).join(SEPARADOR),
    ...filas.map((f) => columnas.map((c) => celda(f[c.clave])).join(SEPARADOR)),
  ];
  return BOM + lineas.join('\r\n') + '\r\n';
}
