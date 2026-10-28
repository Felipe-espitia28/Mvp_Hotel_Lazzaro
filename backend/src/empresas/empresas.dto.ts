import { MedioPago, ReglaEmpresa } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
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
import { NormalizarEmail } from '../auth/auth.dto';

export class CrearEmpresaDto {
  /** "900.123.456-8", "9001234568" o sin el dígito de verificación. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  nit!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  razonSocial!: string;

  /** Correo de facturación. */
  @NormalizarEmail()
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string;

  @IsOptional()
  @IsBoolean()
  credito?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  diasCredito?: number;
}

// Todo opcional: se cambia solo lo que llega.
export class ActualizarEmpresaDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  nit?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  razonSocial?: string;

  @IsOptional()
  @NormalizarEmail()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string;

  @IsOptional()
  @IsBoolean()
  credito?: boolean;

  @IsOptional()
  @ValidateIf((dto: ActualizarEmpresaDto) => dto.diasCredito !== null)
  @IsInt()
  @Min(0)
  @Max(365)
  diasCredito?: number | null;
}

export class BuscarEmpresasDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  buscar?: string;
}

// La empresa que paga una reserva y qué paga; empresaId null la quita.
export class AsignarEmpresaDto {
  @ValidateIf((dto: AsignarEmpresaDto) => dto.empresaId !== null)
  @IsUUID()
  empresaId!: string | null;

  @IsOptional()
  @IsEnum(ReglaEmpresa)
  reglaEmpresa?: ReglaEmpresa;
}

export class AbonoReservaDto {
  @IsUUID()
  reservaId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  monto!: number;
}

// Un pago de la empresa repartido entre varias de sus reservas.
export class AbonoEmpresaDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => AbonoReservaDto)
  pagos!: AbonoReservaDto[];

  @IsEnum(MedioPago)
  medio!: MedioPago;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  referencia?: string;
}
