import { MotivoViaje, Parentesco } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { AMayusculas, CODIGO_PAIS, DatosPersonaDto } from '../../huespedes/huespedes.dto';

// Tope de seguridad de la petición; la capacidad real la limita la habitación (R6).
const MAXIMO_OCUPANTES = 20;

// R43: cada persona que se aloja, con sus datos y los de esta estadía. Los
// datos legales llegan opcionales porque el servicio informa qué falta por
// ocupante (y un huésped que vuelve no tiene que repetir lo que ya está registrado).
export class OcupanteCheckInDto extends DatosPersonaDto {
  @IsBoolean()
  titular!: boolean;

  @IsOptional()
  @AMayusculas()
  @Matches(CODIGO_PAIS, {
    message: 'El país de procedencia debe ser un código de país de 2 letras',
  })
  paisProcedencia?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  ciudadProcedencia?: string;

  /** R44: para un menor, posición en `ocupantes` del adulto responsable. */
  @IsOptional()
  @IsInt()
  @Min(0)
  responsableIndice?: number;

  /** R44: para un menor, su parentesco con el adulto responsable. */
  @IsOptional()
  @IsEnum(Parentesco)
  parentesco?: Parentesco;

  /** R44: recepción revisó el permiso de los padres (familiar o tercero autorizado). */
  @IsOptional()
  @IsBoolean()
  autorizacionVerificada?: boolean;

  /** R45: acepta hoy la política de tratamiento de datos vigente del hotel. */
  @IsOptional()
  @IsBoolean()
  aceptaPoliticaDatos?: boolean;
}

// R19, R43: el check-in registra a todos los ocupantes (Tarjeta de Registro
// de Alojamiento; para extranjeros, reporte a Migración).
export class RegistroCheckInDto {
  @IsEnum(MotivoViaje)
  motivoViaje!: MotivoViaje;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAXIMO_OCUPANTES)
  @ValidateNested({ each: true })
  @Type(() => OcupanteCheckInDto)
  ocupantes!: OcupanteCheckInDto[];
}

export class ConsultarRegistroDto {
  /** Día de llegada a consultar (YYYY-MM-DD). Por defecto, hoy. */
  @IsOptional()
  @IsDateString()
  fecha?: string;
}
