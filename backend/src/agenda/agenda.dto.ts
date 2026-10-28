import { MedioPago } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { HuespedDto } from '../reservas/dto/crear-reserva.dto';

export class CrearRecursoDto {
  /** P. ej. "Cabina 1" o "Terapeuta Ana". */
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  nombre!: string;

  /** Servicios de tipo cita que presta. */
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  servicioIds?: string[];

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class ActualizarRecursoDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  nombre?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  servicioIds?: string[];

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

// Pago en el momento, de quien no tiene una estadía activa a la cual cargarlo.
export class PagoInmediatoDto {
  @IsEnum(MedioPago)
  medio!: MedioPago;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  referencia?: string;
}

// Quiénes toman el servicio (R55): cantidad para fijo o por persona; adultos y
// edades para por edad.
class QuienesDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  cantidad?: number;

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

  /** De una reserva del hotel… */
  @IsOptional()
  @IsUUID()
  reservaId?: string;

  /** …o de un huésped externo (nombre y documento), que paga en el momento. */
  @IsOptional()
  @ValidateNested()
  @Type(() => HuespedDto)
  huesped?: HuespedDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PagoInmediatoDto)
  pago?: PagoInmediatoDto;
}

export class AgendarCitaDto extends QuienesDto {
  @IsUUID()
  servicioId!: string;

  @IsUUID()
  recursoId!: string;

  /** Inicio de la cita (fecha y hora ISO). */
  @IsDateString()
  inicio!: string;
}

export const ESTADOS_DESTINO_CITA = ['en_curso', 'realizada', 'cancelada', 'no_asistio'] as const;

export class CambiarEstadoCitaDto {
  @IsIn(ESTADOS_DESTINO_CITA)
  estado!: (typeof ESTADOS_DESTINO_CITA)[number];

  /** Al marcarla realizada sin estadía activa: el pago en el momento. */
  @IsOptional()
  @ValidateNested()
  @Type(() => PagoInmediatoDto)
  pago?: PagoInmediatoDto;
}

export class ConsultarAgendaDto {
  /** Día (YYYY-MM-DD). Por defecto, hoy en el hotel. */
  @IsOptional()
  @IsDateString()
  fecha?: string;

  @IsOptional()
  @IsUUID()
  recursoId?: string;
}

export class ConsultarDisponibilidadDto {
  @IsUUID()
  servicioId!: string;

  @IsDateString()
  fecha!: string;
}

export class CrearSalidaDto {
  @IsUUID()
  servicioId!: string;

  @IsDateString()
  inicio!: string;

  /** Por defecto, los cupos por salida del servicio. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  cupos?: number;

  /** Crea también la misma salida de las próximas N semanas (0 = solo esta). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(52)
  repetirSemanas?: number;
}

export class ListarSalidasDto {
  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;
}

export class CambiarEstadoSalidaDto {
  @IsIn(['realizada', 'cancelada'])
  estado!: 'realizada' | 'cancelada';
}

export class TomarCupoDto extends QuienesDto {}
