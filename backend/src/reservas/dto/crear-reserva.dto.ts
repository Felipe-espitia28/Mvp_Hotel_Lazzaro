import { Type } from 'class-transformer';
import {
  IsDateString,
  IsDefined,
  IsInt,
  Min,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { DatosPersonaDto, aDatosPersona } from '../../huespedes/huespedes.dto';
import { DatosPersona } from '../../huespedes/datos-legales';

// Titular, anidado dentro de la creación de la reserva. Si el documento ya
// está registrado se reutiliza ese huésped (ver HuespedesService). Al
// reservar basta con el nombre y el documento; el resto se pide en el check-in.
export class HuespedDto extends DatosPersonaDto {
  /** Nombre completo; no hace falta si vienen primerNombre y primerApellido. */
  @ValidateIf((h: HuespedDto) => !h.primerNombre || !h.primerApellido)
  @IsString()
  @IsNotEmpty()
  nombre?: string;
}

// Sin nombres separados, el nombre completo queda como primer nombre y el
// apellido "por completar" (se separa en el check-in).
export const titularDeReserva = ({ nombre, ...datos }: HuespedDto): DatosPersona =>
  aDatosPersona(
    datos.primerNombre && datos.primerApellido
      ? datos
      : { ...datos, primerNombre: nombre, primerApellido: '' },
  );

export class CrearReservaDto {
  @IsString()
  @IsNotEmpty()
  habitacionId!: string;

  // ValidateNested solo valida si el objeto viene; IsDefined lo hace obligatorio.
  @IsDefined()
  @ValidateNested()
  @Type(() => HuespedDto)
  huesped!: HuespedDto;

  /** Huéspedes en la habitación (1 por defecto); no puede superar la capacidad máxima del tipo (R6). */
  @IsOptional()
  @IsInt()
  @Min(1)
  numeroHuespedes?: number;

  @IsDateString()
  fechaEntrada!: string;

  @IsDateString()
  fechaSalida!: string;
}
