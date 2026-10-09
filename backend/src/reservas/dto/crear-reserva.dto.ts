import { Type } from 'class-transformer';
import {
  IsDateString,
  IsDefined,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

// Datos del huésped, anidados dentro de la creación de la reserva
// para simplificar el flujo del MVP (no hay pantalla separada de huéspedes).
class HuespedDto {
  @IsString()
  @IsNotEmpty()
  nombre!: string;

  @IsString()
  @IsNotEmpty()
  documento!: string;

  @IsOptional()
  @IsString()
  telefono?: string;
}

export class CrearReservaDto {
  @IsString()
  @IsNotEmpty()
  habitacionId!: string;

  // ValidateNested solo valida si el objeto viene; IsDefined lo hace obligatorio.
  @IsDefined()
  @ValidateNested()
  @Type(() => HuespedDto)
  huesped!: HuespedDto;

  @IsDateString()
  fechaEntrada!: string;

  @IsDateString()
  fechaSalida!: string;
}
