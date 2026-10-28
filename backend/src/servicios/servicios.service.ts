import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ModoPrecio, Prisma, TipoServicio } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { codigoDesdeNombre } from './codigo';
import {
  ActualizarAtributoDto,
  ActualizarCategoriaDto,
  ActualizarServicioDto,
  ConsultaServiciosDto,
  CrearAtributoDto,
  CrearCategoriaDto,
  CrearServicioDto,
  DisponibilidadDto,
} from './dto/servicios.dto';
import { sinVacios, validarAtributos } from './validar-atributos';

const CODIGO_PRISMA_UNICO = 'P2002';
export const MAXIMO_FOTOS = 3;

// Los campos de un servicio que dependen de su tipo y de su modo de precio.
interface CamposDelTipo {
  tipo: TipoServicio;
  modoPrecio: ModoPrecio;
  precioNino: number | null;
  duracionMinutos: number | null;
  cuposPorSalida: number | null;
  disponibilidad: DisponibilidadDto | null;
}

// S-1: un consumo no tiene duración ni cupos; una cita, duración; una
// experiencia, duración y cupos. El precio de niño solo existe en el modo por
// edad. Lo que no aplica se limpia (cambiar una experiencia a consumo no deja
// cupos sueltos); lo que falta es un error.
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

// La lista no trae las fotos (pesan hasta 200 KB cada una): solo el detalle.
const SIN_FOTOS = { fotos: true } as const;
const CATEGORIA_RESUMIDA = { select: { id: true, nombre: true, clasificacion: true } } as const;

// Catálogo de servicios del hotel (S-1, R22): categorías propias con sus
// atributos, y servicios. Cambiar un servicio no altera los cargos ya hechos:
// cada cargo copia su concepto y su valor.
@Injectable()
export class ServiciosService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Categorías ────────────────────────────────────────────────────────

  listarCategorias(hotelId: string) {
    return this.prisma.categoriaServicio.findMany({
      where: { hotelId },
      include: { atributos: { orderBy: [{ orden: 'asc' }, { etiqueta: 'asc' }] } },
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
    });
  }

  async crearCategoria(hotelId: string, dto: CrearCategoriaDto) {
    // Las nuevas quedan al final.
    const { _max } = await this.prisma.categoriaServicio.aggregate({
      where: { hotelId },
      _max: { orden: true },
    });
    return this.conflicto(`Ya existe la categoría "${dto.nombre}"`, () =>
      this.prisma.categoriaServicio.create({
        data: { ...dto, hotelId, orden: (_max.orden ?? 0) + 1 },
        include: { atributos: true },
      }),
    );
  }

  async actualizarCategoria(hotelId: string, id: string, dto: ActualizarCategoriaDto) {
    await this.categoriaDelHotel(hotelId, id);
    return this.conflicto(`Ya existe la categoría "${dto.nombre}"`, () =>
      this.prisma.categoriaServicio.update({
        where: { id },
        data: dto,
        include: { atributos: true },
      }),
    );
  }

  // El orden que quedó al arrastrarlas; todas deben ser del hotel.
  async ordenarCategorias(hotelId: string, ids: string[]) {
    await this.prisma.$transaction(async (tx) => {
      const propias = await tx.categoriaServicio.count({ where: { hotelId, id: { in: ids } } });
      if (propias !== ids.length) {
        throw new NotFoundException('Categoría no encontrada');
      }
      for (const [orden, id] of ids.entries()) {
        await tx.categoriaServicio.update({ where: { id }, data: { orden: orden + 1 } });
      }
    });
    return this.listarCategorias(hotelId);
  }

  // ── Atributos propios (R54) ───────────────────────────────────────────

  async crearAtributo(hotelId: string, categoriaId: string, dto: CrearAtributoDto) {
    await this.categoriaDelHotel(hotelId, categoriaId);
    const clave = dto.clave ?? codigoDesdeNombre(dto.etiqueta).replace(/-/g, '_');
    const opciones = this.opcionesDe(dto.tipo, dto.opciones);
    return this.conflicto(`La categoría ya tiene el atributo "${clave}"`, () =>
      this.prisma.definicionAtributo.create({
        data: { ...dto, clave, opciones, categoriaId },
      }),
    );
  }

  async actualizarAtributo(
    hotelId: string,
    categoriaId: string,
    atributoId: string,
    dto: ActualizarAtributoDto,
  ) {
    await this.categoriaDelHotel(hotelId, categoriaId);
    const atributo = await this.prisma.definicionAtributo.findFirst({
      where: { id: atributoId, categoriaId },
    });
    if (!atributo) {
      throw new NotFoundException('Atributo no encontrado');
    }
    // Los servicios con valores que ya no cuadran se corrigen al volver a guardarlos.
    const opciones =
      dto.opciones === undefined ? undefined : this.opcionesDe(atributo.tipo, dto.opciones);
    return this.prisma.definicionAtributo.update({
      where: { id: atributoId },
      data: { ...dto, opciones },
    });
  }

  // ── Servicios ─────────────────────────────────────────────────────────

  // Quien no configura el hotel (recepción) solo ve lo que se ofrece: activo,
  // visible para recepción y de una categoría activa.
  listar(hotelId: string, consulta: ConsultaServiciosDto, completo: boolean) {
    const buscar = consulta.buscar?.trim();
    return this.prisma.servicio.findMany({
      where: {
        hotelId,
        categoriaId: consulta.categoriaId,
        tipo: consulta.tipo,
        ...(completo
          ? { activo: consulta.activo }
          : { activo: true, visibleRecepcion: true, categoria: { activa: true } }),
        ...(buscar && {
          OR: [
            { nombre: { contains: buscar, mode: 'insensitive' } },
            { codigo: { contains: buscar, mode: 'insensitive' } },
          ],
        }),
      },
      omit: SIN_FOTOS,
      include: { categoria: CATEGORIA_RESUMIDA },
      orderBy: [{ activo: 'desc' }, { nombre: 'asc' }],
    });
  }

  async detalle(hotelId: string, id: string) {
    const servicio = await this.prisma.servicio.findFirst({
      where: { id, hotelId },
      include: { categoria: CATEGORIA_RESUMIDA },
    });
    if (!servicio) {
      throw new NotFoundException('Servicio no encontrado');
    }
    return servicio;
  }

  async crear(hotelId: string, dto: CrearServicioDto) {
    const { atributos, disponibilidad, ...resto } = dto;
    const datos = await this.validarServicio(hotelId, {
      categoriaId: dto.categoriaId,
      atributos: atributos ?? {},
      campos: {
        tipo: dto.tipo ?? 'consumo',
        modoPrecio: dto.modoPrecio ?? 'fijo',
        precioNino: dto.precioNino ?? null,
        duracionMinutos: dto.duracionMinutos ?? null,
        cuposPorSalida: dto.cuposPorSalida ?? null,
        disponibilidad: disponibilidad ?? null,
      },
    });
    const codigo = dto.codigo ?? codigoDesdeNombre(dto.nombre);
    return this.guardar(dto.nombre, codigo, () =>
      this.prisma.servicio.create({
        data: { ...resto, ...datos, codigo, hotelId },
        omit: SIN_FOTOS,
        include: { categoria: CATEGORIA_RESUMIDA },
      }),
    );
  }

  async actualizar(hotelId: string, id: string, dto: ActualizarServicioDto) {
    const actual = await this.detalle(hotelId, id);
    const { atributos, disponibilidad, ...resto } = dto;
    // Se valida el servicio como quedaría: la categoría final define los atributos.
    const datos = await this.validarServicio(hotelId, {
      categoriaId: dto.categoriaId ?? actual.categoriaId,
      atributos: atributos ?? (actual.atributos as Record<string, unknown>),
      campos: {
        tipo: dto.tipo ?? actual.tipo,
        modoPrecio: dto.modoPrecio ?? actual.modoPrecio,
        precioNino:
          dto.precioNino === undefined ? (actual.precioNino?.toNumber() ?? null) : dto.precioNino,
        duracionMinutos:
          dto.duracionMinutos === undefined ? actual.duracionMinutos : dto.duracionMinutos,
        cuposPorSalida:
          dto.cuposPorSalida === undefined ? actual.cuposPorSalida : dto.cuposPorSalida,
        disponibilidad:
          disponibilidad === undefined
            ? (actual.disponibilidad as unknown as DisponibilidadDto | null)
            : disponibilidad,
      },
    });
    return this.guardar(dto.nombre ?? actual.nombre, dto.codigo ?? actual.codigo, () =>
      this.prisma.servicio.update({
        where: { id },
        data: { ...resto, ...datos },
        omit: SIN_FOTOS,
        include: { categoria: CATEGORIA_RESUMIDA },
      }),
    );
  }

  async agregarFoto(hotelId: string, id: string, foto: string) {
    const servicio = await this.detalle(hotelId, id);
    if (servicio.fotos.length >= MAXIMO_FOTOS) {
      throw new BadRequestException(`Un servicio admite hasta ${MAXIMO_FOTOS} fotos`);
    }
    await this.prisma.servicio.update({ where: { id }, data: { fotos: { push: foto } } });
    return this.detalle(hotelId, id);
  }

  async quitarFoto(hotelId: string, id: string, indice: number) {
    const servicio = await this.detalle(hotelId, id);
    if (!(indice >= 0 && indice < servicio.fotos.length)) {
      throw new NotFoundException('Foto no encontrada');
    }
    await this.prisma.servicio.update({
      where: { id },
      data: { fotos: servicio.fotos.filter((_f, i) => i !== indice) },
    });
    return this.detalle(hotelId, id);
  }

  // Un servicio que se ofrece (activo y de una categoría activa), para
  // cargarlo al folio.
  async paraCargar(hotelId: string, id: string) {
    const servicio = await this.prisma.servicio.findFirst({
      where: { id, hotelId, activo: true, categoria: { activa: true } },
      include: { categoria: true },
    });
    if (!servicio) {
      throw new NotFoundException('Servicio no encontrado en el catálogo del hotel');
    }
    return servicio;
  }

  // ── Ayudantes ─────────────────────────────────────────────────────────

  private async categoriaDelHotel(hotelId: string, id: string) {
    const categoria = await this.prisma.categoriaServicio.findFirst({
      where: { id, hotelId },
      include: { atributos: true },
    });
    if (!categoria) {
      throw new NotFoundException('Categoría no encontrada');
    }
    return categoria;
  }

  // Los campos del tipo y los atributos (R54), contra la categoría del hotel.
  private async validarServicio(
    hotelId: string,
    {
      categoriaId,
      atributos,
      campos,
    }: {
      categoriaId: string;
      atributos: Record<string, unknown>;
      campos: CamposDelTipo;
    },
  ) {
    const categoria = await this.categoriaDelHotel(hotelId, categoriaId);
    const valores = sinVacios(atributos);
    const delTipo = camposDelTipo(campos);
    const errores = [...delTipo.errores, ...validarAtributos(valores, categoria.atributos)];
    if (errores.length > 0) {
      throw new BadRequestException(errores);
    }
    return {
      ...delTipo.datos,
      categoriaId,
      atributos: valores as Prisma.InputJsonObject,
      disponibilidad: campos.disponibilidad
        ? { ...campos.disponibilidad, dias: [...campos.disponibilidad.dias].sort((a, b) => a - b) }
        : Prisma.DbNull,
    };
  }

  // Solo la lista lleva opciones, y la necesita.
  private opcionesDe(tipo: string, opciones: string[] | undefined) {
    if (tipo !== 'lista') return [];
    const limpias = (opciones ?? []).map((o) => o.trim()).filter(Boolean);
    if (limpias.length === 0) {
      throw new BadRequestException('Una lista necesita al menos una opción');
    }
    return limpias;
  }

  // Un código o un nombre repetido en el hotel es un conflicto (409).
  private async guardar<T>(nombre: string, codigo: string, accion: () => Promise<T>) {
    try {
      return await accion();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === CODIGO_PRISMA_UNICO
      ) {
        throw new ConflictException(
          String(error.meta?.target ?? '').includes('codigo')
            ? `Ya existe el código "${codigo}" en el catálogo`
            : `Ya existe "${nombre}" en el catálogo`,
        );
      }
      throw error;
    }
  }

  private async conflicto<T>(mensaje: string, accion: () => Promise<T>) {
    try {
      return await accion();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === CODIGO_PRISMA_UNICO
      ) {
        throw new ConflictException(mensaje);
      }
      throw error;
    }
  }
}
