import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export const DIAS_CALENDARIO_POR_DEFECTO = 14;
export const DIAS_CALENDARIO_MAXIMO = 31;
// B-1: un año de noches es el período más largo que se calcula de una vez.
export const DIAS_GERENCIA_MAXIMO = 366;

export class ConsultarCalendarioDto {
  /** Primer día a mostrar (YYYY-MM-DD). Por defecto, hoy. */
  @IsOptional()
  @IsDateString()
  desde?: string;

  /** Cantidad de días a mostrar (1 a 31). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(DIAS_CALENDARIO_MAXIMO)
  dias?: number;
}

export class ConsultarGerenciaDto {
  /** Primer día del período (YYYY-MM-DD). Por defecto, el primero de este mes. */
  @IsOptional()
  @IsDateString()
  desde?: string;

  /** Último día del período, incluido (YYYY-MM-DD). Por defecto, el último de este mes. */
  @IsOptional()
  @IsDateString()
  hasta?: string;
}

export class ConsultarPronosticoDto {
  /** Días hacia adelante desde hoy: 7 o 30. */
  @IsOptional()
  @Type(() => Number)
  @IsIn([7, 30], { message: 'Los días del pronóstico son 7 o 30' })
  dias?: number;
}

export class ConsultarPickupDto {
  /** Reservas creadas en los últimos N días (1 a 90). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  dias?: number;
}
