import { CategoriaCargo, MedioPago } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class AgregarCargoDto {
  @IsEnum(CategoriaCargo)
  categoria!: CategoriaCargo;

  /** Descripción del consumo, p. ej. "Agua 600 ml" o "Cena". */
  @IsString()
  @IsNotEmpty()
  concepto!: string;

  @IsInt()
  @Min(1)
  @Max(100)
  cantidad!: number;

  /** Valor final por unidad, impuestos incluidos (⚖️ validar con contador). */
  @IsNumber()
  @IsPositive()
  valorUnitario!: number;
}

export class AnularCargoDto {
  /** Por qué se anula (queda en la auditoría). */
  @IsString()
  @IsNotEmpty()
  motivo!: string;
}

export class CheckOutDto {
  @IsEnum(MedioPago)
  medioPago!: MedioPago;
}
