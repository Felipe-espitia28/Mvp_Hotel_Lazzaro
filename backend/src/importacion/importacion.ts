// A-4: utilidades puras para importar filas leídas de un CSV o Excel. El
// archivo se lee en el navegador; aquí llegan las filas con los encabezados
// tal como venían, y se validan igual que un alta manual. Sin NestJS ni
// Prisma: se prueban sin base de datos. El plan 09 las reutiliza.

export const LIMITE_FILAS = 500;

export type Fila = Record<string, unknown>;
export type EstadoFila = 'crear' | 'actualizar' | 'error';

export interface FilaInforme {
  // Número de la fila en el archivo (la 1 son los encabezados).
  fila: number;
  // La clave natural del registro (p. ej. el número de habitación).
  numero: string;
  estado: EstadoFila;
  errores: string[];
}

export interface InformeImportacion {
  filas: FilaInforme[];
  resumen: { total: number; crear: number; actualizar: number; error: number };
}

// "Número de habitación", "NUMERO", " numero_habitacion " → "numerodehabitacion"...:
// minúsculas, sin tildes y sin espacios, guiones ni guiones bajos, para que los
// encabezados que escribe cada hotel coincidan con los alias.
export function normalizarEncabezado(encabezado: string) {
  return encabezado
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\s_\-.º°]/g, '');
}

// Pasa las claves de una fila a sus nombres canónicos según los alias
// (`{ numero: ['numero', 'no', 'num', 'habitacion'] }`); las columnas que no
// coinciden con ningún alias se descartan.
export function normalizarFila(fila: Fila, alias: Record<string, string[]>): Fila {
  const canonico = new Map<string, string>();
  for (const [clave, nombres] of Object.entries(alias)) {
    for (const nombre of [clave, ...nombres]) canonico.set(normalizarEncabezado(nombre), clave);
  }
  const resultado: Fila = {};
  for (const [encabezado, valor] of Object.entries(fila)) {
    const clave = canonico.get(normalizarEncabezado(encabezado));
    if (clave && !(clave in resultado)) resultado[clave] = valor;
  }
  return resultado;
}

// Texto de una celda, sin espacios a los lados ("" si está vacía).
export function aTexto(valor: unknown) {
  return valor === null || valor === undefined ? '' : String(valor).trim();
}

// Una fila sin ningún valor (las filas en blanco al final de un Excel) se ignora.
export function esFilaVacia(fila: Fila) {
  return Object.values(fila).every((v) => aTexto(v) === '');
}

// Entero de una celda; undefined si está vacía y null si no es un entero.
export function aEntero(valor: unknown): number | null | undefined {
  const texto = aTexto(valor);
  if (texto === '') return undefined;
  return /^-?\d+$/.test(texto) ? Number(texto) : null;
}

// Sí/no de una celda: si, sí, no, true, false, 1, 0 (sin importar mayúsculas
// ni tildes); undefined si está vacía y null si no es ninguno de esos.
export function aBooleano(valor: unknown): boolean | null | undefined {
  if (typeof valor === 'boolean') return valor;
  const texto = normalizarEncabezado(aTexto(valor));
  if (texto === '') return undefined;
  if (['si', 'true', '1'].includes(texto)) return true;
  if (['no', 'false', '0'].includes(texto)) return false;
  return null;
}

// Número de una celda, como lo escriben en Colombia: "85.000" (punto de
// miles), "85,5" o "1.234,56" (coma decimal), "$ 85.000"; también "85.5". Un
// número de Excel pasa tal cual. undefined si está vacía y null si no es un número.
export function aNumero(valor: unknown): number | null | undefined {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  let texto = aTexto(valor).replace(/[$\s]/g, '');
  if (texto === '') return undefined;
  if (texto.includes(',')) {
    // Con coma, el punto solo puede ser de miles.
    texto = texto.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(texto)) {
    texto = texto.replace(/\./g, '');
  }
  return /^-?\d+(\.\d+)?$/.test(texto) ? Number(texto) : null;
}

// Fecha de una celda en dd/mm/aaaa o aaaa-mm-dd (o un Date de Excel), como
// aaaa-mm-dd; undefined si está vacía y null si no es una fecha válida.
export function aFecha(valor: unknown): string | null | undefined {
  if (valor instanceof Date) {
    return isNaN(valor.getTime()) ? null : valor.toISOString().slice(0, 10);
  }
  const texto = aTexto(valor);
  if (texto === '') return undefined;
  const latina = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(texto);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  const partes = latina ? [latina[3], latina[2], latina[1]] : iso ? [iso[1], iso[2], iso[3]] : null;
  if (!partes) return null;
  const [a, m, d] = partes;
  const fecha = `${a}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  const comprobada = new Date(`${fecha}T00:00:00Z`);
  // Descarta fechas que no existen (31/02/2030).
  return !isNaN(comprobada.getTime()) && comprobada.toISOString().startsWith(fecha) ? fecha : null;
}

export function armarInforme(filas: FilaInforme[]): InformeImportacion {
  const contar = (estado: EstadoFila) => filas.filter((f) => f.estado === estado).length;
  return {
    filas,
    resumen: {
      total: filas.length,
      crear: contar('crear'),
      actualizar: contar('actualizar'),
      error: contar('error'),
    },
  };
}
