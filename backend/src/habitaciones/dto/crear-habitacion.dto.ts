import { IsNotEmpty, IsNumber, IsPositive, IsString } from 'class-validator';

// Datos requeridos para crear una habitación.
export class CrearHabitacionDto {
  @IsString()
  @IsNotEmpty()
  numero!: string;

  @IsString()
  @IsNotEmpty()
  tipo!: string;

  @IsNumber()
  @IsPositive()
  tarifaNoche!: number;
}
