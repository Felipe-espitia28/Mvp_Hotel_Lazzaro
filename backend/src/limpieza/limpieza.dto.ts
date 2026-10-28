import { PrioridadIncidencia, TipoTareaLimpieza } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class ListarTareasDto {
  /** Día del hotel (AAAA-MM-DD); por defecto, hoy. */
  @IsOptional()
  @IsDateString({ strict: true })
  fecha?: string;

  /** Solo las de una persona (lo usa recepción). */
  @IsOptional()
  @IsUUID()
  asignadaA?: string;
}

// Una tarea a mano: una limpieza profunda o un repaso fuera del automático.
export class CrearTareaDto {
  @IsUUID()
  habitacionId!: string;

  @IsEnum(TipoTareaLimpieza)
  tipo!: TipoTareaLimpieza;

  @IsOptional()
  @IsDateString({ strict: true })
  fecha?: string;

  @IsOptional()
  @IsUUID()
  asignadaAId?: string;
}

export class AsignarTareasDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  tareaIds!: string[];

  /** null = quitar la asignación. */
  @ValidateIf((dto: AsignarTareasDto) => dto.usuarioId !== null)
  @IsUUID()
  usuarioId!: string | null;
}

export const ACCIONES_TAREA = ['iniciar', 'terminar'] as const;
export type AccionTarea = (typeof ACCIONES_TAREA)[number];

export class AvanzarTareaDto {
  @IsIn(ACCIONES_TAREA)
  accion!: AccionTarea;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observaciones?: string;
}

export class ReportarIncidenciaDto {
  @IsUUID()
  habitacionId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  descripcion!: string;

  @IsEnum(PrioridadIncidencia)
  prioridad!: PrioridadIncidencia;

  @IsBoolean()
  sacaDeServicio!: boolean;
}

export class ListarIncidenciasDto {
  @IsOptional()
  @IsIn(['abierta', 'resuelta'])
  estado?: 'abierta' | 'resuelta';
}

export class ResolverIncidenciaDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  solucion?: string;
}
