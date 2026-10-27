// A-6: municipios de Colombia de la DIVIPOLA del DANE (datos.gov.co, conjunto
// "DIVIPOLA - Códigos municipios", gdxc-w37w, corte del 30 de diciembre de
// 2024). Las ciudades se guardan como texto; aquí se reconoce su código para
// los reportes legales. Sin NestJS ni Prisma: se prueba sin base de datos.
import DATOS_DIVIPOLA from './municipios-divipola.json';

export interface Municipio {
  codigo: string; // 5 dígitos: departamento (2) + municipio (3)
  nombre: string;
  departamento: string;
}

export const MUNICIPIOS: Municipio[] = DATOS_DIVIPOLA;

// Como se muestra y se guarda: "Medellín, Antioquia". El nombre se repite en
// varios departamentos (La Unión, Granada...), así que el departamento va
// siempre, salvo cuando es el mismo nombre (Bogotá, D.C.).
export const etiquetaMunicipio = (m: Municipio) =>
  m.nombre === m.departamento ? m.nombre : `${m.nombre}, ${m.departamento}`;

// Sin tildes, mayúsculas ni espacios de más.
const normalizar = (texto: string) =>
  texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// El nombre oficial de algunas ciudades no es el que se usa a diario.
const NOMBRE_COMUN: Record<string, string> = {
  bogota: 'bogota, d.c.',
  cali: 'santiago de cali',
  cartagena: 'cartagena de indias',
  cucuta: 'san jose de cucuta',
};
const oficial = (nombre: string) => NOMBRE_COMUN[nombre] ?? nombre;

const PORETIQUETA = new Map(MUNICIPIOS.map((m) => [normalizar(etiquetaMunicipio(m)), m.codigo]));
const DEPARTAMENTOS = new Set(MUNICIPIOS.map((m) => normalizar(m.departamento)));
const PORNOMBRE = new Map<string, string[]>();
for (const m of MUNICIPIOS) {
  const clave = normalizar(m.nombre);
  PORNOMBRE.set(clave, [...(PORNOMBRE.get(clave) ?? []), m.codigo]);
}

// Código DIVIPOLA de una ciudad escrita como texto, o null si no se puede
// saber con certeza (no se adivina): "Cali, Valle del Cauca", "Santiago de
// Cali" o "Cali" → 76001; "La Unión" sin departamento → null (hay varias).
export function codigoMunicipio(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const t = normalizar(texto);
  const exacto = PORETIQUETA.get(t);
  if (exacto) return exacto;

  const coma = t.lastIndexOf(',');
  if (coma > 0) {
    const departamento = t.slice(coma + 1).trim();
    if (DEPARTAMENTOS.has(departamento)) {
      const nombre = oficial(t.slice(0, coma).trim());
      const codigo = MUNICIPIOS.find(
        (m) => normalizar(m.nombre) === nombre && normalizar(m.departamento) === departamento,
      )?.codigo;
      return codigo ?? null;
    }
  }

  const codigos = PORNOMBRE.get(oficial(t)) ?? [];
  return codigos.length === 1 ? codigos[0] : null;
}
