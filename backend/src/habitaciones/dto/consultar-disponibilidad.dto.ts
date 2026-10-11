import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';

// Query params del endpoint de disponibilidad.
export class ConsultarDisponibilidadDto {
  @IsDateString()
  desde!: string;

  @IsDateString()
  hasta!: string;

  /** Número de huéspedes (1 por defecto): excluye habitaciones sin capacidad. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  huespedes?: number;
}
