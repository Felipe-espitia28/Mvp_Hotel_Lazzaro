import { IsIn } from 'class-validator';

// Estados que se ponen a mano (R25, R26). "ocupada" y "en_limpieza" los
// ponen el check-in y el check-out.
export const ESTADOS_MANUALES = ['libre', 'fuera_servicio'] as const;
export type EstadoManual = (typeof ESTADOS_MANUALES)[number];

export class CambiarEstadoDto {
  /** "libre" = lista para el siguiente huésped; "fuera_servicio" = mantenimiento. */
  @IsIn(ESTADOS_MANUALES)
  estado!: EstadoManual;
}
