import type { ModoPrecio, Servicio, TipoServicio } from '../api/types';

// S-1: reglas del catálogo de servicios en el navegador, sin React para poder
// probarlas. El backend es quien decide (servicios/precio-servicio.ts); esto
// solo arma el formulario y la vista previa del total.

// Qué campos muestra el formulario según el tipo: una cita, la duración; una
// experiencia, la duración y los cupos.
export function camposDelTipo(tipo: TipoServicio) {
  return { duracion: tipo !== 'consumo', cupos: tipo === 'experiencia' };
}

export const ETIQUETA_TIPO_SERVICIO: Record<TipoServicio, string> = {
  consumo: 'Consumo',
  cita: 'Cita',
  experiencia: 'Experiencia',
};

export const ETIQUETA_MODO_PRECIO: Record<ModoPrecio, string> = {
  fijo: 'Precio fijo',
  por_persona: 'Por persona',
  por_edad: 'Por edad (adulto y niño)',
};

// Igual que el backend: minúsculas, sin tildes y con guiones.
export function codigoDesdeNombre(nombre: string) {
  const codigo = nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return codigo || 'servicio';
}

// "3, 8" o "3 8" → [3, 8]; null si algo no es una edad de niño (0–17).
export function leerEdades(texto: string): number[] | null {
  const partes = texto.split(/[\s,;]+/).filter(Boolean);
  if (!partes.every((p) => /^\d{1,2}$/.test(p) && Number(p) <= 17)) return null;
  return partes.map(Number);
}

interface Rangos {
  gratisHasta: number;
  ninoHasta: number;
}

// Vista previa del total que cobrará el folio (R55).
export function precioEstimado(
  servicio: Pick<Servicio, 'modoPrecio' | 'precio' | 'precioNino'>,
  quienes: { cantidad: number; adultos: number; edadesNinos: number[] },
  rangos: Rangos,
) {
  const precio = Number(servicio.precio);
  if (servicio.modoPrecio !== 'por_edad') return Math.round(precio * quienes.cantidad);
  const conCargo = quienes.edadesNinos.filter(
    (e) => e > rangos.gratisHasta && e <= rangos.ninoHasta,
  ).length;
  // Un "niño" mayor que el rango de niño paga como adulto.
  const comoAdultos = quienes.edadesNinos.filter((e) => e > rangos.ninoHasta).length;
  const precioNino = servicio.precioNino === null ? precio : Number(servicio.precioNino);
  return Math.round((quienes.adultos + comoAdultos) * precio + conCargo * precioNino);
}
