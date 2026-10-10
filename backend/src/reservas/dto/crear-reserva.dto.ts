import { TipoDocumento } from '@prisma/client';
import { Type } from 'class-transformer';
import { NormalizarDocumento } from '../../huespedes/documento';
import {
  IsDateString,
  IsDefined,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

// Datos del huésped, anidados dentro de la creación de la reserva. Si el
// documento ya está registrado se reutiliza ese huésped (ver HuespedesService).
class HuespedDto {
  @IsString()
  @IsNotEmpty()
  nombre!: string;

  // Si no se indica, se asume cédula de ciudadanía.
  @IsOptional()
  @IsEnum(TipoDocumento)
  tipoDocumento?: TipoDocumento;

  @NormalizarDocumento()
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
