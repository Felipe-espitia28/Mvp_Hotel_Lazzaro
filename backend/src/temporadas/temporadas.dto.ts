import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

const DIAS_POR_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// Mes y día como número (MMDD): 1215 = 15 de diciembre. Admite el 29 de febrero.
export function esMesDiaValido(valor: number) {
  const mes = Math.floor(valor / 100);
  const dia = valor % 100;
  return mes >= 1 && mes <= 12 && dia >= 1 && dia <= DIAS_POR_MES[mes - 1];
}

@ValidatorConstraint({ name: 'mesDia' })
class MesDiaValido implements ValidatorConstraintInterface {
  validate(valor: unknown) {
    return typeof valor === 'number' && esMesDiaValido(valor);
  }

  defaultMessage() {
    return 'La fecha debe ser mes y día válidos (p. ej. 1215 = 15 de diciembre)';
  }
}

export class CrearTemporadaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  nombre!: string;

  @IsIn(['alta', 'media'])
  tipo!: 'alta' | 'media';

  @IsInt()
  @Validate(MesDiaValido)
  desde!: number;

  @IsInt()
  @Validate(MesDiaValido)
  hasta!: number;
}

export class ActualizarTemporadaDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  nombre?: string;

  @IsOptional()
  @IsIn(['alta', 'media'])
  tipo?: 'alta' | 'media';

  @IsOptional()
  @IsInt()
  @Validate(MesDiaValido)
  desde?: number;

  @IsOptional()
  @IsInt()
  @Validate(MesDiaValido)
  hasta?: number;

  @IsOptional()
  @IsBoolean()
  activa?: boolean;
}
