import { ModoPrecio, Prisma, Servicio, TipoServicio } from '@prisma/client';
import { ActualizarServicioDto, CrearServicioDto, DisponibilidadDto } from './dto/servicios.dto';
import { Definicion, sinVacios, validarAtributos } from './validar-atributos';

// S-1: las reglas de un servicio que no caben en el DTO, compartidas por el
// alta manual y la carga masiva (plan 09): los campos de su tipo y los
// atributos propios de su categoría (R54). Sin NestJS ni base de datos.

// Los campos de un servicio que dependen de su tipo y de su modo de precio.
export interface CamposDelTipo {
  tipo: TipoServicio;
  modoPrecio: ModoPrecio;
  precioNino: number | null;
  duracionMinutos: number | null;
  cuposPorSalida: number | null;
  disponibilidad: DisponibilidadDto | null;
}

// Un consumo no tiene duración ni cupos; una cita, duración; una experiencia,
// duración y cupos. El precio de niño solo existe en el modo por edad. Lo que
// no aplica se limpia (cambiar una experiencia a consumo no deja cupos
// sueltos); lo que falta es un error.
export function camposDelTipo(campos: CamposDelTipo) {
  const errores: string[] = [];
  const conDuracion = campos.tipo !== 'consumo';
  if (conDuracion && campos.duracionMinutos === null) {
    errores.push('Indica la duración en minutos');
  }
  if (campos.tipo === 'experiencia' && campos.cuposPorSalida === null) {
    errores.push('Indica los cupos por salida');
  }
  if (campos.modoPrecio === 'por_edad' && campos.precioNino === null) {
    errores.push('Indica el precio de niño');
  }
  if (campos.disponibilidad && campos.disponibilidad.desde >= campos.disponibilidad.hasta) {
    errores.push('El horario debe terminar después de empezar');
  }
  return {
    errores,
    datos: {
      tipo: campos.tipo,
      modoPrecio: campos.modoPrecio,
      precioNino: campos.modoPrecio === 'por_edad' ? campos.precioNino : null,
      duracionMinutos: conDuracion ? campos.duracionMinutos : null,
      cuposPorSalida: campos.tipo === 'experiencia' ? campos.cuposPorSalida : null,
    },
  };
}

// Los campos de un servicio nuevo (lo que falta toma su valor por defecto).
export function camposAlCrear(dto: CrearServicioDto): CamposDelTipo {
  return {
    tipo: dto.tipo ?? 'consumo',
    modoPrecio: dto.modoPrecio ?? 'fijo',
    precioNino: dto.precioNino ?? null,
    duracionMinutos: dto.duracionMinutos ?? null,
    cuposPorSalida: dto.cuposPorSalida ?? null,
    disponibilidad: dto.disponibilidad ?? null,
  };
}

// Los campos como quedarían tras editar: lo que no viene se conserva y null vacía.
export function camposAlActualizar(actual: Servicio, dto: ActualizarServicioDto): CamposDelTipo {
  const o = <T>(nuevo: T | undefined, anterior: T) => (nuevo === undefined ? anterior : nuevo);
  return {
    tipo: o(dto.tipo, actual.tipo),
    modoPrecio: o(dto.modoPrecio, actual.modoPrecio),
    precioNino: o(dto.precioNino, actual.precioNino?.toNumber() ?? null),
    duracionMinutos: o(dto.duracionMinutos, actual.duracionMinutos),
    cuposPorSalida: o(dto.cuposPorSalida, actual.cuposPorSalida),
    disponibilidad: o(
      dto.disponibilidad,
      actual.disponibilidad as unknown as DisponibilidadDto | null,
    ),
  };
}

// Revisa el servicio como quedaría y devuelve sus errores y los datos a guardar.
export function revisarServicio(
  definiciones: Definicion[],
  atributos: Record<string, unknown>,
  campos: CamposDelTipo,
) {
  const valores = sinVacios(atributos);
  const delTipo = camposDelTipo(campos);
  return {
    errores: [...delTipo.errores, ...validarAtributos(valores, definiciones)],
    datos: {
      ...delTipo.datos,
      atributos: valores as Prisma.InputJsonObject,
      disponibilidad: campos.disponibilidad
        ? { ...campos.disponibilidad, dias: [...campos.disponibilidad.dias].sort((a, b) => a - b) }
        : Prisma.DbNull,
    },
  };
}
