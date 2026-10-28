import { CategoriaCargo, MedioPago, Responsable } from '@prisma/client';
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

// Un consumo se carga desde el catálogo del hotel (servicioId) o con valor
// libre (categoría, concepto y valor), p. ej. una cena a la carta.
export class AgregarCargoDto {
  @IsOptional()
  @IsUUID()
  servicioId?: string;

  @ValidateIf((dto: AgregarCargoDto) => !dto.servicioId)
  @IsEnum(CategoriaCargo)
  categoria?: CategoriaCargo;

  /** Descripción del consumo, p. ej. "Agua 600 ml" o "Cena". */
  @ValidateIf((dto: AgregarCargoDto) => !dto.servicioId)
  @IsString()
  @IsNotEmpty()
  concepto?: string;

  /** Unidades (precio fijo o valor libre) o personas (precio por persona). */
  @ValidateIf((dto: AgregarCargoDto) => !dto.servicioId || dto.cantidad !== undefined)
  @IsInt()
  @Min(1)
  @Max(100)
  cantidad?: number;

  /** R55: precio por edad: los adultos y la edad de cada niño. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  adultos?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(17, { each: true })
  edadesNinos?: number[];

  /** Valor final por unidad, impuestos incluidos (⚖️ validar con contador). */
  @ValidateIf((dto: AgregarCargoDto) => !dto.servicioId)
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

// A-1 / A-2: un pago al folio: anticipo (antes de llegar), abono (durante la
// estadía o del saldo pendiente) o reembolso (de un saldo a favor).
export class RegistrarPagoDto {
  @IsOptional()
  @IsIn(['abono', 'anticipo', 'reembolso'])
  tipo?: 'abono' | 'anticipo' | 'reembolso';

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

  /** B-5: a qué subcuenta abona (por defecto, la del huésped). */
  @IsOptional()
  @IsEnum(Responsable)
  responsable?: Responsable;
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

// B-5: pasar un cargo de la cuenta del huésped a la de la empresa (o al revés).
export class MoverCargoDto {
  @IsEnum(Responsable)
  responsable!: Responsable;
}
