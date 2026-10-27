import { MedioPago } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

// Multiplicador de cada temporada sobre la tarifa base (R13).
export class MultiplicadoresDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.5)
  @Max(5)
  baja!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.5)
  @Max(5)
  media!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.5)
  @Max(5)
  alta!: number;
}

// Lo que el administrador ajusta de las reglas de su hotel. Todo es opcional:
// lo que no envíe se conserva. Los rangos evitan valores que dejarían al hotel
// sin poder operar (p. ej. una estadía máxima de 0 noches).
export class PoliticasDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  horaCheckIn?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  horaCheckOut?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  estadiaMaximaNoches?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(730)
  antelacionMaximaDias?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(720)
  horasCancelacionGratuita?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3)
  nochesPenalidad?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => MultiplicadoresDto)
  multiplicadorTemporada?: MultiplicadoresDto;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(30)
  ivaPorcentaje?: number;

  @IsOptional()
  @IsBoolean()
  exencionIvaPasaporte?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'El hotel debe recibir al menos un medio de pago' })
  @ArrayUnique()
  @IsEnum(MedioPago, { each: true })
  mediosPago?: MedioPago[];

  @IsOptional()
  @IsBoolean()
  puentesFestivosMedia?: boolean;

  @IsOptional()
  @IsBoolean()
  semanaSantaAlta?: boolean;

  /** A-3: hasta esta edad un niño no paga (0 = solo los bebés). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(17)
  edadMaximaNinoGratis?: number;

  /** A-3: hasta esta edad paga tarifa de niño; desde la siguiente, como adulto. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(17)
  edadMaximaNino?: number;
}
