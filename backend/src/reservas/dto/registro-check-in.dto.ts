import { MotivoViaje } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

// R19: datos del registro hotelero que se completan en el check-in (Tarjeta
// de Registro Hotelero; para extranjeros, reporte a Migración).
export class RegistroCheckInDto {
  /** País de nacionalidad, código ISO de 2 letras (CO, VE, US...). */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z]{2}$/, { message: 'La nacionalidad debe ser un código de país de 2 letras' })
  nacionalidad!: string;

  /** Ciudad (y país) de donde viene el huésped. */
  @IsString()
  @IsNotEmpty()
  procedencia!: string;

  @IsEnum(MotivoViaje)
  motivoViaje!: MotivoViaje;
}

export class ConsultarRegistroDto {
  /** Día de llegada a consultar (YYYY-MM-DD). Por defecto, hoy. */
  @IsOptional()
  @IsDateString()
  fecha?: string;
}
