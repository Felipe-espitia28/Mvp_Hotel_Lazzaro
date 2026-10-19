import { CategoriaCargo } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export class CrearProductoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  nombre!: string;

  @IsEnum(CategoriaCargo)
  categoria!: CategoriaCargo;

  /** Valor final por unidad, impuestos incluidos (⚖️ validar con contador). */
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  precio!: number;
}

export class ActualizarProductoDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  nombre?: string;

  @IsOptional()
  @IsEnum(CategoriaCargo)
  categoria?: CategoriaCargo;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  precio?: number;

  // Un producto no se borra (los cargos lo referencian): se desactiva.
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
