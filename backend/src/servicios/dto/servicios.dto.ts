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

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  nombre!: string;

  @IsOptional()
  @SeVaciaConNull()
  @IsString()
  @MaxLength(500)
  descripcion?: string | null;

  @IsUUID()
  categoriaId!: string;

  @IsOptional()
  @IsEnum(TipoServicio)
  tipo?: TipoServicio;

  @IsOptional()
  @IsEnum(ModoPrecio)
  modoPrecio?: ModoPrecio;

  /** Valor final (adulto o único), impuestos incluidos (⚖️ validar con contador). */
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  precio!: number;

  /** Por niño con cargo, si el modo es por edad. */
  @IsOptional()
  @SeVaciaConNull()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  precioNino?: number | null;

  /** Cita y experiencia. */
  @IsOptional()
  @SeVaciaConNull()
  @IsInt()
  @Min(5)
  @Max(1440)
  duracionMinutos?: number | null;

  /** Experiencia: personas por salida. */
  @IsOptional()
  @SeVaciaConNull()
  @IsInt()
  @Min(1)
  @Max(500)
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
  @IsBoolean()
  visibleRecepcion?: boolean;
}

export class ActualizarServicioDto {
  @IsOptional()
  @Matches(/^[a-z0-9][a-z0-9-]{0,59}$/, {
    message: 'El código va en minúsculas, con guiones (p. ej. masaje-60)',
  })
  codigo?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  nombre?: string;

  @IsOptional()
  @SeVaciaConNull()
  @IsString()
  @MaxLength(500)
  descripcion?: string | null;

  @IsOptional()
  @IsUUID()
  categoriaId?: string;

  @IsOptional()
  @IsEnum(TipoServicio)
  tipo?: TipoServicio;

  @IsOptional()
  @IsEnum(ModoPrecio)
  modoPrecio?: ModoPrecio;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  precio?: number;

  @IsOptional()
  @SeVaciaConNull()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  precioNino?: number | null;

  @IsOptional()
  @SeVaciaConNull()
  @IsInt()
  @Min(5)
  @Max(1440)
  duracionMinutos?: number | null;

  @IsOptional()
  @SeVaciaConNull()
  @IsInt()
  @Min(1)
  @Max(500)
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
  @IsBoolean()
  visibleRecepcion?: boolean;

  // Un servicio no se borra (los cargos lo referencian): se desactiva.
  @IsOptional()
  @IsBoolean()
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
