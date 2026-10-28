// S-1: código de un servicio derivado de su nombre ("Masaje relajante 60 min"
// → "masaje-relajante-60-min"). Es la misma regla con la que la migración del
// plan 08 llenó el código de los productos existentes.
export function codigoDesdeNombre(nombre: string) {
  const codigo = nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return codigo || 'servicio';
}
