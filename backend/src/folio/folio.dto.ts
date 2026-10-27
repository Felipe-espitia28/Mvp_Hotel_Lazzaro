import { CategoriaCargo, MedioPago } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
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

// A-1: un pago al folio. Por API solo abonos y reembolsos; los anticipos
// (antes del check-in) llegan con el plan 06.
export class RegistrarPagoDto {
  @IsOptional()
  @IsIn(['abono', 'reembolso'])
  tipo?: 'abono' | 'reembolso';

  @IsEnum(MedioPago)
  medio!: MedioPago;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  monto!: number;

  /** Número del voucher o de la transferencia. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  referencia?: string;
}

export class AnularPagoDto {
  /** Por qué se anula (queda en la auditoría). */
  @IsString()
  @IsNotEmpty()
  motivo!: string;
}

// R23 / A-1: los pagos finales del check-out deben dejar el saldo en 0.
export class CheckOutDto {
  /** Uno o varios medios ("$300.000 en efectivo + el resto con tarjeta"). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => RegistrarPagoDto)
  pagos?: RegistrarPagoDto[];

  /** Atajo: paga todo el saldo con este medio (no va junto con `pagos`). */
  @IsOptional()
  @IsEnum(MedioPago)
  medioPago?: MedioPago;

  /** Cierra aunque quede saldo pendiente (cuenta por cobrar; permiso cuentas:por-cobrar). */
  @IsOptional()
  @IsBoolean()
  cerrarConSaldo?: boolean;

  /** Cierra con saldo a favor del huésped, sin reembolsarlo ahora. */
  @IsOptional()
  @IsBoolean()
  saldoAFavor?: boolean;
}
