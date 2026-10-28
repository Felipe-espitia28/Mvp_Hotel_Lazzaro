import { ReglaEmpresa } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsDefined,
  IsEnum,
  IsUUID,
  IsInt,
  Max,
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

// Tope de seguridad de la petición; la capacidad real la limita la habitación (R6).
const MAXIMO_NINOS = 10;

export class CrearReservaDto {
  @IsString()
  @IsNotEmpty()
  habitacionId!: string;

  // ValidateNested solo valida si el objeto viene; IsDefined lo hace obligatorio.
  @IsDefined()
  @ValidateNested()
  @Type(() => HuespedDto)
  huesped!: HuespedDto;

  /** Adultos (1 por defecto). Adultos + niños no pueden superar la capacidad máxima del tipo (R6). */
  @IsOptional()
  @IsInt()
  @Min(1)
  adultos?: number;

  /** A-3: edad de cada niño a la fecha de entrada (0 a 17 años). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAXIMO_NINOS)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(17, { each: true })
  edadesNinos?: number[];

  @IsDateString()
  fechaEntrada!: string;

  @IsDateString()
  fechaSalida!: string;

  /** B-5: la empresa que paga (y qué paga: el alojamiento o todo). */
  @IsOptional()
  @IsUUID()
  empresaId?: string;

  @IsOptional()
  @IsEnum(ReglaEmpresa)
  reglaEmpresa?: ReglaEmpresa;
}
