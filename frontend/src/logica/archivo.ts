import Papa from 'papaparse';

// A-4: el archivo de una importación se lee en el navegador y al backend van
// las filas como objetos, con los encabezados tal como venían (el backend los
// normaliza y valida). El plan 09 lo reutiliza.

export type FilaArchivo = Record<string, unknown>;

// CSV con el separador que traiga (";" de Excel en Colombia o ","); la
// primera fila son los encabezados.
export function filasDeCsv(texto: string): FilaArchivo[] {
  const { data } = Papa.parse<FilaArchivo>(texto.replace(/^\uFEFF/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  });
  return data;
}

// Una hoja de Excel (filas de celdas): la primera fila son los encabezados.
export function filasDeHoja(hoja: unknown[][]): FilaArchivo[] {
  const [encabezados = [], ...filas] = hoja;
  const nombres = encabezados.map((e) => (e === null || e === undefined ? '' : String(e).trim()));
  return filas.map((celdas) =>
    Object.fromEntries(
      nombres.flatMap((nombre, i) => (nombre ? [[nombre, celdas[i] ?? null]] : [])),
    ),
  );
}

export async function leerArchivo(archivo: File): Promise<FilaArchivo[]> {
  const nombre = archivo.name.toLowerCase();
  if (nombre.endsWith('.csv') || nombre.endsWith('.txt')) {
    return filasDeCsv(await archivo.text());
  }
  if (nombre.endsWith('.xlsx')) {
    // Se carga solo al importar un Excel: no pesa en el resto de la aplicación.
    const { readSheet } = await import('read-excel-file/browser');
    return filasDeHoja(await readSheet(archivo));
  }
  throw new Error('El archivo debe ser .csv o .xlsx (en Excel: Guardar como → Libro de Excel)');
}
