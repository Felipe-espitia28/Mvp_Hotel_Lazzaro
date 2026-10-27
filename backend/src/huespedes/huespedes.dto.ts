import { TipoDocumento } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { NormalizarDocumento } from './documento';
import { DatosPersona } from './datos-legales';

export class BuscarHuespedesDto {
  /** Parte del nombre o inicio del número de documento. */
  @IsString()
  @IsNotEmpty()
  buscar!: string;
}

// Código de país ISO 3166-1 alfa-2 (CO, VE, US...), sin importar mayúsculas ni espacios.
export const CODIGO_PAIS = /^[A-Z]{2}$/;
export const AMayusculas = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value));

// Datos de una persona (R43). Todo es opcional salvo el documento: al
// reservar basta con lo mínimo, y el check-in dice qué falta (por ocupante).
export class DatosPersonaDto {
  // Si no se indica, se asume cédula de ciudadanía.
  @IsOptional()
  @IsEnum(TipoDocumento)
  tipoDocumento?: TipoDocumento;

  @NormalizarDocumento()
  @IsString()
  @IsNotEmpty()
  documento!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  primerNombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  segundoNombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  primerApellido?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  segundoApellido?: string;

  /** YYYY-MM-DD. */
  @IsOptional()
  @IsDateString()
  fechaNacimiento?: string;

  @IsOptional()
  @AMayusculas()
  @Matches(CODIGO_PAIS, { message: 'La nacionalidad debe ser un código de país de 2 letras' })
  nacionalidad?: string;

  @IsOptional()
  @AMayusculas()
  @Matches(CODIGO_PAIS, { message: 'El país de residencia debe ser un código de país de 2 letras' })
  paisResidencia?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  ciudadResidencia?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  telefono?: string;
}

// Del formulario al dominio: solo importa el día de nacimiento.
export const aDatosPersona = ({ fechaNacimiento, ...resto }: DatosPersonaDto): DatosPersona => ({
  ...resto,
  fechaNacimiento: fechaNacimiento ? new Date(fechaNacimiento.slice(0, 10)) : undefined,
});
