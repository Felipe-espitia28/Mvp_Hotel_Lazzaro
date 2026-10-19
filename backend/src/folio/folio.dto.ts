import { CategoriaCargo, MedioPago } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

// Un consumo se carga desde el catálogo del hotel (productoId) o con valor
// libre (categoría, concepto y valor), p. ej. una cena a la carta.
export class AgregarCargoDto {
  @IsOptional()
  @IsUUID()
  productoId?: string;

  @ValidateIf((dto: AgregarCargoDto) => !dto.productoId)
  @IsEnum(CategoriaCargo)
  categoria?: CategoriaCargo;

  /** Descripción del consumo, p. ej. "Agua 600 ml" o "Cena". */
  @ValidateIf((dto: AgregarCargoDto) => !dto.productoId)
  @IsString()
  @IsNotEmpty()
  concepto?: string;

  @IsInt()
  @Min(1)
  @Max(100)
  cantidad!: number;

  /** Valor final por unidad, impuestos incluidos (⚖️ validar con contador). */
  @ValidateIf((dto: AgregarCargoDto) => !dto.productoId)
  @IsNumber()
  @IsPositive()
  valorUnitario?: number;
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
