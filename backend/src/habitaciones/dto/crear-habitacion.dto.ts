import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

// Datos requeridos para crear una habitación. El precio y la capacidad vienen
// de su tipo (R12).
export class CrearHabitacionDto {
  @IsString()
  @IsNotEmpty()
  numero!: string;

  @IsString()
  @IsNotEmpty()
  tipoHabitacionId!: string;

  /** A-4: si no se da, se infiere del número (101 → 1). */
  @IsOptional()
  @IsInt()
  @Min(0)
  piso?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  descripcion?: string;
}
