import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';

export const DIAS_CALENDARIO_POR_DEFECTO = 14;
export const DIAS_CALENDARIO_MAXIMO = 31;

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
