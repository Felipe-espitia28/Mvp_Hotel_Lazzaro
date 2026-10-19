import { IsIn, IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';

// Tipografías que la app trae empaquetadas (funcionan sin internet). Un hotel
// elige entre estas; no se cargan fuentes externas.
export const FUENTES_TITULOS = ['Arial', 'Montserrat', 'Lora', 'Playfair Display'] as const;
export const FUENTES_TEXTO = ['Arial', 'Inter', 'Nunito Sans'] as const;

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

// Logo: imagen PNG, JPG o WEBP como data URL. No se acepta SVG (puede llevar
// scripts). 200 KB de imagen ≈ 270.000 caracteres en base64.
export const PATRON_LOGO = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;
export const LARGO_MAXIMO_LOGO = 280_000;

// Edición de la marca desde la Gerencia: los campos de marca más el logo
// (null = quitarlo).
export class ActualizarMarcaDto extends MarcaHotelDto {
  @IsOptional()
  @ValidateIf((_dto, valor) => valor !== null)
  @MaxLength(LARGO_MAXIMO_LOGO, { message: 'El logo debe pesar como máximo 200 KB' })
  @Matches(PATRON_LOGO, { message: 'El logo debe ser una imagen PNG, JPG o WEBP' })
  logo?: string | null;
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
