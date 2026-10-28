import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
} from './dto/servicios.dto';
import {
  CamposDelTipo,
  camposAlActualizar,
  camposAlCrear,
  revisarServicio,
} from './revisar-servicio';

const CODIGO_PRISMA_UNICO = 'P2002';
export const MAXIMO_FOTOS = 3;

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
    // La disponibilidad ya va (validada) en los datos revisados.
    const { atributos, disponibilidad: _disponibilidad, ...resto } = dto;
    const datos = await this.validarServicio(hotelId, {
      categoriaId: dto.categoriaId,
      atributos: atributos ?? {},
      campos: camposAlCrear(dto),
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
    // La disponibilidad ya va (validada) en los datos revisados.
    const { atributos, disponibilidad: _disponibilidad, ...resto } = dto;
    // Se valida el servicio como quedaría: la categoría final define los atributos.
    const datos = await this.validarServicio(hotelId, {
      categoriaId: dto.categoriaId ?? actual.categoriaId,
      atributos: atributos ?? (actual.atributos as Record<string, unknown>),
      campos: camposAlActualizar(actual, dto),
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

  // Una categoría del hotel con sus atributos (otro hotel → 404).
  async categoriaDelHotel(hotelId: string, id: string) {
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
    const { errores, datos } = revisarServicio(categoria.atributos, atributos, campos);
    if (errores.length > 0) {
      throw new BadRequestException(errores);
    }
    return { ...datos, categoriaId };
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
