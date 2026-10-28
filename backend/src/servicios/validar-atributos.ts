import { TipoAtributo } from '@prisma/client';

// S-1 (R54): los atributos propios de un servicio se validan contra las
// definiciones de su categoría. Función pura: se prueba sin base de datos.
// Los atributos solo se muestran y se filtran; ningún cálculo los usa.

export const LARGO_MAXIMO_TEXTO_ATRIBUTO = 200;

export interface Definicion {
  clave: string;
  etiqueta: string;
  tipo: TipoAtributo;
  opciones: string[];
  obligatorio: boolean;
}

const vacio = (valor: unknown) =>
  valor === undefined || valor === null || (typeof valor === 'string' && valor.trim() === '');

function errorDeTipo(valor: unknown, d: Definicion): string | null {
  switch (d.tipo) {
    case 'texto':
      if (typeof valor !== 'string') return `"${d.etiqueta}" debe ser un texto`;
      return valor.length > LARGO_MAXIMO_TEXTO_ATRIBUTO
        ? `"${d.etiqueta}" admite hasta ${LARGO_MAXIMO_TEXTO_ATRIBUTO} caracteres`
        : null;
    case 'numero':
      return typeof valor === 'number' && Number.isFinite(valor)
        ? null
        : `"${d.etiqueta}" debe ser un número`;
    case 'si_no':
      return typeof valor === 'boolean' ? null : `"${d.etiqueta}" debe ser sí o no`;
    case 'lista':
      return typeof valor === 'string' && d.opciones.includes(valor)
        ? null
        : `"${d.etiqueta}" debe ser una de: ${d.opciones.join(', ')}`;
  }
}

// Errores de los valores (vacío si son válidos). Las claves que su categoría
// no define se rechazan, para que un error de escritura no se guarde en silencio.
export function validarAtributos(valores: Record<string, unknown>, definiciones: Definicion[]) {
  const errores: string[] = [];
  const conocidas = new Set(definiciones.map((d) => d.clave));
  for (const clave of Object.keys(valores)) {
    if (!conocidas.has(clave)) errores.push(`La categoría no tiene el atributo "${clave}"`);
  }
  for (const d of definiciones) {
    const valor = valores[d.clave];
    if (vacio(valor)) {
      if (d.obligatorio) errores.push(`Falta "${d.etiqueta}"`);
      continue;
    }
    const error = errorDeTipo(valor, d);
    if (error) errores.push(error);
  }
  return errores;
}

// Los valores sin los vacíos (un campo opcional en blanco no se guarda).
export function sinVacios(valores: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(valores).filter(([, v]) => !vacio(v)));
}
