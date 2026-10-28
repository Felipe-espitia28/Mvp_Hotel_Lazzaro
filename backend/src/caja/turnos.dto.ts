import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class AbrirTurnoDto {
  /** El efectivo con el que se empieza el turno. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  baseEfectivo!: number;
}

export class CerrarTurnoDto {
  /** El efectivo que hay en la caja al cerrar. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  efectivoContado!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observaciones?: string;
}

export class ListarTurnosDto {
  /** Turnos abiertos desde este día (YYYY-MM-DD). Por defecto, hace 30 días. */
  @IsOptional()
  @IsDateString()
  desde?: string;

  /** Hasta este día, incluido. */
  @IsOptional()
  @IsDateString()
  hasta?: string;

  /** Solo el admin puede ver los de otro usuario. */
  @IsOptional()
  @IsUUID()
  usuarioId?: string;
}
