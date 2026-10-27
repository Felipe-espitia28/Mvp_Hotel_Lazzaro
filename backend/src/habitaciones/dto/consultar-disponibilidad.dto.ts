import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';

// Query params del endpoint de disponibilidad.
export class ConsultarDisponibilidadDto {
  @IsDateString()
  desde!: string;

  @IsDateString()
  hasta!: string;

  /** Adultos (1 por defecto). Con los niños, excluye habitaciones sin capacidad (R6). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  adultos?: number;

  /** A-3: edad de cada niño, separadas por coma (p. ej. `3,8`). */
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? (value === '' ? [] : value.split(',').map(Number)) : value,
  )
  @IsArray()
  @ArrayMaxSize(10)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(17, { each: true })
  edadesNinos?: number[];
}
