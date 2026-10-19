import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

// Tipografías que la app trae empaquetadas (funcionan sin internet). Un hotel
// elige entre estas; no se cargan fuentes externas.
export const FUENTES_TITULOS = ['Playfair Display', 'Lora', 'Montserrat'] as const;
export const FUENTES_TEXTO = ['Inter', 'Nunito Sans'] as const;

export const PATRON_COLOR = /^#[0-9a-fA-F]{6}$/;
const MENSAJE_COLOR = 'El color debe ser un hexadecimal como #1e3a5f';

// Campos de marca que el hotel personaliza (todos opcionales al editar).
export class MarcaHotelDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  eslogan?: string;

  @IsOptional()
  @Matches(PATRON_COLOR, { message: MENSAJE_COLOR })
  colorPrimario?: string;

  @IsOptional()
  @Matches(PATRON_COLOR, { message: MENSAJE_COLOR })
  colorAcento?: string;

  @IsOptional()
  @IsIn(FUENTES_TITULOS)
  fuenteTitulos?: string;

  @IsOptional()
  @IsIn(FUENTES_TEXTO)
  fuenteTexto?: string;
}

// Lo que cualquiera puede ver de la marca de un hotel (p. ej. en su login).
export const CAMPOS_MARCA = {
  slug: true,
  nombre: true,
  eslogan: true,
  logo: true,
  colorPrimario: true,
  colorAcento: true,
  fuenteTitulos: true,
  fuenteTexto: true,
} as const;
