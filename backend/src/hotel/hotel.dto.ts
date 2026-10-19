import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

// Datos generales del hotel que su administrador edita en la Gerencia.
export class DatosHotelDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  ciudad?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  nit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string;
}
