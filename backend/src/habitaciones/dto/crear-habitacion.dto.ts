import { IsNotEmpty, IsString } from 'class-validator';

// Datos requeridos para crear una habitación. El precio y la capacidad vienen
// de su tipo (R12).
export class CrearHabitacionDto {
  @IsString()
  @IsNotEmpty()
  numero!: string;

  @IsString()
  @IsNotEmpty()
  tipoHabitacionId!: string;
}
