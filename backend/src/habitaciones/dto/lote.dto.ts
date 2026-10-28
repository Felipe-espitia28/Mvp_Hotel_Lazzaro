import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { LIMITE_FILAS } from '../../importacion/importacion';
import { ESTADOS_MANUALES, type EstadoManual } from './cambiar-estado.dto';

// A-4: crear las habitaciones "101" a "120" de una vez.
export class CrearRangoDto {
  @Matches(/^\d{1,6}$/, { message: '"desde" debe ser un número' })
  desde!: string;

  @Matches(/^\d{1,6}$/, { message: '"hasta" debe ser un número' })
  hasta!: string;

  @IsString()
  @IsNotEmpty()
  tipoId!: string;

  /** Si no se da, se infiere de cada número (101 → 1). */
  @IsOptional()
  @IsInt()
  @Min(0)
  piso?: number;

  /** Se antepone a cada número (p. ej. "C-" → "C-101"). */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  prefijo?: string;
}

// Filas leídas del archivo, con los encabezados tal como venían: el backend
// los normaliza y valida cada fila igual que un alta manual.
export class ImportarHabitacionesDto {
  @IsArray()
  @ArrayMaxSize(LIMITE_FILAS, { message: `El archivo admite hasta ${LIMITE_FILAS} filas` })
  @IsObject({ each: true })
  filas!: Record<string, unknown>[];
}

export class ConsultaImportarDto {
  /** true: devuelve el informe sin guardar nada. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  soloValidar?: boolean;
}

class LoteDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(LIMITE_FILAS)
  @IsString({ each: true })
  ids!: string[];
}

export class LoteEstadoDto extends LoteDto {
  @IsIn(ESTADOS_MANUALES)
  estado!: EstadoManual;
}

export class LoteTipoDto extends LoteDto {
  @IsString()
  @IsNotEmpty()
  tipoId!: string;
}
