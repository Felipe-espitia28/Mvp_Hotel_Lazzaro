import { EstadoReserva } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export const POR_PAGINA_POR_DEFECTO = 20;

// Filtros y paginación del listado de reservas.
export class ListarReservasDto {
  @IsOptional()
  @IsEnum(EstadoReserva)
  estado?: EstadoReserva;

  /** Nombre o documento del huésped, o número de habitación. */
  @IsOptional()
  @IsString()
  buscar?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  porPagina?: number;
}
