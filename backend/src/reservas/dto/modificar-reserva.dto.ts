import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

// A-5 (R7): lo que cambia de una reserva; lo que no viene se conserva. Una
// estadía activa solo cambia la salida o la habitación.
export class ModificarReservaDto {
  @IsOptional()
  @IsDateString()
  fechaEntrada?: string;

  @IsOptional()
  @IsDateString()
  fechaSalida?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  habitacionId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  adultos?: number;

  /** Edad de cada niño a la fecha de entrada (0 a 17 años). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(17, { each: true })
  edadesNinos?: number[];

  /** El hotel cambia la habitación por su cuenta: se conserva el precio (solo admin). */
  @IsOptional()
  @IsIn(['decision_hotel'])
  motivo?: 'decision_hotel';

  /** Las noches nuevas a la tarifa media de las pactadas (solo admin). */
  @IsOptional()
  @IsBoolean()
  mantenerTarifaPorNoche?: boolean;
}
