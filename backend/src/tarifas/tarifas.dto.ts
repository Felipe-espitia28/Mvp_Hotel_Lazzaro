import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CrearTipoHabitacionDto {
  /** Identificador corto en minúsculas, p. ej. "doble" o "suite-vista-mar". */
  @Matches(/^[a-z0-9-]+$/, { message: 'El código solo admite minúsculas, números y guiones' })
  codigo!: string;

  @IsString()
  @IsNotEmpty()
  nombre!: string;

  /** Tarifa por noche en temporada baja. */
  @IsNumber()
  @IsPositive()
  tarifaBase!: number;

  @IsInt()
  @Min(1)
  capacidadIncluida!: number;

  @IsInt()
  @Min(1)
  capacidadMaxima!: number;

  @IsNumber()
  @Min(0)
  cargoPersonaAdicional!: number;
}

// El código no se edita: lo usan las habitaciones y los reportes.
export class ActualizarTipoHabitacionDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nombre?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  tarifaBase?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacidadIncluida?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacidadMaxima?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cargoPersonaAdicional?: number;
}

export class ConsultarTemporadasDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  anio?: number;
}
