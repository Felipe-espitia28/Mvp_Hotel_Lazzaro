// Opciones de marca de un hotel (las mismas que valida el backend en
// backend/src/hotel/marca.ts). Las fuentes van empaquetadas: funcionan sin internet.
export const FUENTES_TITULOS = ['Playfair Display', 'Lora', 'Montserrat'] as const;
export const FUENTES_TEXTO = ['Inter', 'Nunito Sans'] as const;

// Marca de Lazaro: la de la consola y la de los hoteles que no la personalizan.
export const MARCA_LAZARO = {
  colorPrimario: '#0f1b2d',
  colorAcento: '#c9a227',
  fuenteTitulos: 'Playfair Display',
  fuenteTexto: 'Inter',
};

// "Hotel Sol Caribe" → "hotel-sol-caribe" (para la dirección del ingreso).
export function aSlug(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}
