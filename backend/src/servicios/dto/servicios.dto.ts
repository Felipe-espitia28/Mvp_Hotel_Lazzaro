import { CategoriaCargo, ModoPrecio, TipoAtributo, TipoServicio } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { LARGO_MAXIMO_LOGO, PATRON_LOGO } from '../../hotel/marca';
import { LIMITE_FILAS } from '../../importacion/importacion';

// Un campo que se puede vaciar con null al editar (p. ej. quitar la descripción).
const SeVaciaConNull = () => ValidateIf((_dto, valor) => valor !== null);

// ── Categorías del hotel ──────────────────────────────────────────────────

export class CrearCategoriaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  nombre!: string;

  /** Clasificación contable fija (la usan los reportes). */
  @IsEnum(CategoriaCargo)
  clasificacion!: CategoriaCargo;

  /** Nombre de un icono de la interfaz, p. ej. "sparkles". */
  @IsOptional()
  @SeVaciaConNull()
  @Matches(/^[a-z0-9-]{1,40}$/, { message: 'El icono no es válido' })
  icono?: string | null;
}

export class ActualizarCategoriaDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  nombre?: string;

  @IsOptional()
  @IsEnum(CategoriaCargo)
  clasificacion?: CategoriaCargo;

  @IsOptional()
  @SeVaciaConNull()
  @Matches(/^[a-z0-9-]{1,40}$/, { message: 'El icono no es válido' })
  icono?: string | null;

  // Una categoría no se borra (sus servicios la referencian): se desactiva.
  @IsOptional()
  @IsBoolean()
  activa?: boolean;
}

// El orden en que se muestran, como quedó al arrastrarlas.
export class OrdenCategoriasDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  ids!: string[];
}

// ── Atributos propios (R54) ───────────────────────────────────────────────

export class CrearAtributoDto {
  /** Si falta, sale de la etiqueta ("Nivel de dificultad" → nivel_de_dificultad). */
  @IsOptional()
  @Matches(/^[a-z][a-z0-9_]{0,39}$/, {
    message: 'La clave va en minúsculas, sin espacios (p. ej. nivel_dificultad)',
  })
  clave?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  etiqueta!: string;

  @IsEnum(TipoAtributo)
  tipo!: TipoAtributo;

  /** Solo para el tipo lista. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(60, { each: true })
  opciones?: string[];

  @IsOptional()
  @IsBoolean()
  obligatorio?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  orden?: number;
}

// La clave y el tipo no cambian: son los del JSON de cada servicio.
export class ActualizarAtributoDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  etiqueta?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(60, { each: true })
  opciones?: string[];

  @IsOptional()
  @IsBoolean()
  obligatorio?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  orden?: number;
}

// ── Servicios ─────────────────────────────────────────────────────────────

const PATRON_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

// Días de la semana (1 = lunes … 7 = domingo) y horario en que se ofrece.
export class DisponibilidadDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  dias!: number[];

  @Matches(PATRON_HORA, { message: 'La hora "desde" debe ser como 08:00' })
  desde!: string;

  @Matches(PATRON_HORA, { message: 'La hora "hasta" debe ser como 18:00' })
  hasta!: string;
}

export class CrearServicioDto {
  /** Único en el hotel; si falta, sale del nombre. Lo usa la carga masiva. */
  @IsOptional()
  @Matches(/^[a-z0-9][a-z0-9-]{0,59}$/, {
    message: 'El código va en minúsculas, con guiones (p. ej. masaje-60)',
  })
  codigo?: string;

  @IsString({ message: 'El nombre debe ser un texto' })
  @IsNotEmpty({ message: 'Falta el nombre' })
  @MaxLength(80, { message: 'El nombre admite hasta 80 caracteres' })
  nombre!: string;

  @IsOptional()
  @SeVaciaConNull()
  @IsString({ message: 'La descripción debe ser un texto' })
  @MaxLength(500, { message: 'La descripción admite hasta 500 caracteres' })
  descripcion?: string | null;

  @IsUUID()
  categoriaId!: string;

  @IsOptional()
  @IsEnum(TipoServicio, { message: 'El tipo debe ser consumo, cita o experiencia' })
  tipo?: TipoServicio;

  @IsOptional()
  @IsEnum(ModoPrecio, { message: 'El modo de precio debe ser fijo, por_persona o por_edad' })
  modoPrecio?: ModoPrecio;

  /** Valor final (adulto o único), impuestos incluidos (⚖️ validar con contador). */
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El precio debe ser un número' })
  @IsPositive({ message: 'El precio debe ser mayor que 0' })
  precio!: number;

  /** Por niño con cargo, si el modo es por edad. */
  @IsOptional()
  @SeVaciaConNull()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El precio de niño debe ser un número' })
  @Min(0, { message: 'El precio de niño debe ser al menos 0' })
  precioNino?: number | null;

  /** Cita y experiencia. */
  @IsOptional()
  @SeVaciaConNull()
  @IsInt({ message: 'La duración debe ser un número entero' })
  @Min(5, { message: 'La duración debe ser al menos 5' })
  @Max(1440, { message: 'La duración admite como máximo 1440' })
  duracionMinutos?: number | null;

  /** Experiencia: personas por salida. */
  @IsOptional()
  @SeVaciaConNull()
  @IsInt({ message: 'Los cupos por salida deben ser un número entero' })
  @Min(1, { message: 'Los cupos por salida deben ser al menos 1' })
  @Max(500, { message: 'Los cupos por salida admiten como máximo 500' })
  cuposPorSalida?: number | null;

  @IsOptional()
  @SeVaciaConNull()
  @ValidateNested()
  @Type(() => DisponibilidadDto)
  disponibilidad?: DisponibilidadDto | null;

  /** Valores de los atributos propios de la categoría (R54). */
  @IsOptional()
  @IsObject()
  atributos?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean({ message: 'Visible para recepción debe ser sí o no' })
  visibleRecepcion?: boolean;

  /** Por defecto se ofrece; la carga masiva puede crearlo pausado. */
  @IsOptional()
  @IsBoolean({ message: 'Activo debe ser sí o no' })
  activo?: boolean;
}

export class ActualizarServicioDto {
  @IsOptional()
  @Matches(/^[a-z0-9][a-z0-9-]{0,59}$/, {
    message: 'El código va en minúsculas, con guiones (p. ej. masaje-60)',
  })
  codigo?: string;

  @IsOptional()
  @IsString({ message: 'El nombre debe ser un texto' })
  @IsNotEmpty({ message: 'Falta el nombre' })
  @MaxLength(80, { message: 'El nombre admite hasta 80 caracteres' })
  nombre?: string;

  @IsOptional()
  @SeVaciaConNull()
  @IsString({ message: 'La descripción debe ser un texto' })
  @MaxLength(500, { message: 'La descripción admite hasta 500 caracteres' })
  descripcion?: string | null;

  @IsOptional()
  @IsUUID()
  categoriaId?: string;

  @IsOptional()
  @IsEnum(TipoServicio, { message: 'El tipo debe ser consumo, cita o experiencia' })
  tipo?: TipoServicio;

  @IsOptional()
  @IsEnum(ModoPrecio, { message: 'El modo de precio debe ser fijo, por_persona o por_edad' })
  modoPrecio?: ModoPrecio;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El precio debe ser un número' })
  @IsPositive({ message: 'El precio debe ser mayor que 0' })
  precio?: number;

  @IsOptional()
  @SeVaciaConNull()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El precio de niño debe ser un número' })
  @Min(0, { message: 'El precio de niño debe ser al menos 0' })
  precioNino?: number | null;

  @IsOptional()
  @SeVaciaConNull()
  @IsInt({ message: 'La duración debe ser un número entero' })
  @Min(5, { message: 'La duración debe ser al menos 5' })
  @Max(1440, { message: 'La duración admite como máximo 1440' })
  duracionMinutos?: number | null;

  @IsOptional()
  @SeVaciaConNull()
  @IsInt({ message: 'Los cupos por salida deben ser un número entero' })
  @Min(1, { message: 'Los cupos por salida deben ser al menos 1' })
  @Max(500, { message: 'Los cupos por salida admiten como máximo 500' })
  cuposPorSalida?: number | null;

  @IsOptional()
  @SeVaciaConNull()
  @ValidateNested()
  @Type(() => DisponibilidadDto)
  disponibilidad?: DisponibilidadDto | null;

  @IsOptional()
  @IsObject()
  atributos?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean({ message: 'Visible para recepción debe ser sí o no' })
  visibleRecepcion?: boolean;

  // Un servicio no se borra (los cargos lo referencian): se desactiva.
  @IsOptional()
  @IsBoolean({ message: 'Activo debe ser sí o no' })
  activo?: boolean;
}

export class ConsultaServiciosDto {
  @IsOptional()
  @IsUUID()
  categoriaId?: string;

  @IsOptional()
  @IsEnum(TipoServicio)
  tipo?: TipoServicio;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  buscar?: string;
}

// Una foto por petición: así cabe en el límite de 400 KB (configurar-app.ts).
export class AgregarFotoDto {
  @MaxLength(LARGO_MAXIMO_LOGO, { message: 'La foto debe pesar como máximo 200 KB' })
  @Matches(PATRON_LOGO, { message: 'La foto debe ser una imagen PNG, JPG o WEBP' })
  foto!: string;
}

// Plan 09: filas leídas del archivo, con los encabezados tal como venían: el
// backend los normaliza y valida cada fila igual que un alta manual.
export class ImportarServiciosDto {
  @IsArray()
  @ArrayMaxSize(LIMITE_FILAS, { message: `El archivo admite hasta ${LIMITE_FILAS} filas` })
  @IsObject({ each: true })
  filas!: Record<string, unknown>[];
}
