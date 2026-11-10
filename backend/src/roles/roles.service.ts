import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UsuarioAutenticado } from '../auth/decoradores';
import { CATALOGO_PERMISOS, GRUPOS_PERMISOS, PERMISOS, PLANTILLAS_DE_ROL } from '../auth/permisos';
import {
  etiquetaPermiso,
  permisosDeUsuario,
  puedeOtorgar,
  SELECCION_PERMISOS,
  validarPermisos,
} from '../auth/permisos-efectivos';
import { Reloj } from '../hotel/reloj';
import { PrismaService } from '../prisma/prisma.service';
import { ActualizarRolDto, CrearRolDto } from './roles.dto';
import { MENSAJE_GOBIERNO, bloquearHotel, exigirGobierno } from './gobierno';

type Transaccion = Prisma.TransactionClient;
const CODIGO_PRISMA_UNICO = 'P2002';
const SENSIBLES = new Set(
  CATALOGO_PERMISOS.filter((e) => e.sensible).map((e) => e.clave as string),
);

// Plan 19: los roles de cada hotel. Los edita quien tiene roles:gestionar,
// sin dar lo que no tiene (R76) y sin dejar al hotel sin gobierno (R78).
@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reloj: Reloj,
  ) {}

  // El catálogo agrupado y explicado que usa la pantalla.
  catalogo() {
    return {
      grupos: GRUPOS_PERMISOS,
      permisos: CATALOGO_PERMISOS,
      plantillas: Object.entries(PLANTILLAS_DE_ROL).map(([nombre, p]) => ({
        nombre,
        descripcion: p.descripcion,
        permisos: p.permisos,
      })),
    };
  }

  async listar(hotelId: string) {
    const roles = await this.prisma.rolHotel.findMany({
      where: { hotelId },
      include: { _count: { select: { usuarios: true } } },
      orderBy: { nombre: 'asc' },
    });
    return roles.map(({ _count, ...rol }) => ({
      ...rol,
      personas: _count.usuarios,
      sensibles: rol.permisos.filter((p) => SENSIBLES.has(p)).length,
    }));
  }

  async detalle(hotelId: string, id: string) {
    const rol = await this.prisma.rolHotel.findFirst({
      where: { id, hotelId },
      include: {
        usuarios: {
          select: { id: true, nombre: true, email: true, activo: true },
          orderBy: { nombre: 'asc' },
        },
      },
    });
    if (!rol) throw new NotFoundException('Rol no encontrado');
    return rol;
  }

  async crear(hotelId: string, dto: CrearRolDto, quien: UsuarioAutenticado) {
    let permisos = dto.permisos ?? [];
    let descripcion = dto.descripcion;
    if (dto.duplicarDe) {
      const original = await this.prisma.rolHotel.findFirst({
        where: { id: dto.duplicarDe, hotelId },
      });
      if (!original) throw new NotFoundException('Rol no encontrado');
      permisos = dto.permisos ?? original.permisos;
      descripcion = dto.descripcion ?? original.descripcion ?? undefined;
    }
    this.exigirValidos(permisos);
    this.exigirQuePuedaOtorgar(quien, permisos);
    return this.conNombreUnico(() =>
      this.prisma.$transaction(async (tx) => {
        const rol = await tx.rolHotel.create({
          data: { hotelId, nombre: dto.nombre.trim(), descripcion, permisos },
        });
        await this.auditar(tx, rol.id, hotelId, quien.id, 'creado', null, rol);
        return rol;
      }),
    );
  }

  // Aplica de inmediato a todas las personas con el rol (R77): la guardia
  // recalcula los permisos en cada petición.
  async actualizar(hotelId: string, id: string, dto: ActualizarRolDto, quien: UsuarioAutenticado) {
    if (dto.permisos) this.exigirValidos(dto.permisos);
    return this.conNombreUnico(() =>
      this.prisma.$transaction(async (tx) => {
        await bloquearHotel(tx, hotelId);
        const antes = await this.exigirRol(tx, hotelId, id);
        if (dto.permisos) {
          // Solo cuenta lo que se agrega: conservar un permiso no es darlo.
          const agregados = dto.permisos.filter((p) => !antes.permisos.includes(p));
          this.exigirQuePuedaOtorgar(quien, agregados);
        }
        const despues = await tx.rolHotel.update({
          where: { id },
          data: {
            ...(dto.nombre !== undefined && { nombre: dto.nombre.trim() }),
            ...(dto.descripcion !== undefined && { descripcion: dto.descripcion.trim() || null }),
            ...(dto.permisos && { permisos: dto.permisos }),
          },
        });
        await exigirGobierno(tx, hotelId);
        await this.auditar(tx, id, hotelId, quien.id, 'editado', antes, despues);
        const personasAfectadas = await tx.usuario.count({ where: { rolId: id } });
        return { ...despues, personasAfectadas };
      }),
    );
  }

  // Qué pasaría si el rol tuviera estos permisos: no guarda nada.
  async vistaPrevia(hotelId: string, id: string, permisos: string[]) {
    const rol = await this.exigirRol(this.prisma, hotelId, id);
    const activos = await this.prisma.usuario.findMany({
      where: { hotelId, tipo: 'hotel' },
      select: { rolId: true, activo: true, ...SELECCION_PERMISOS },
    });
    const conCambio = (u: (typeof activos)[number]) =>
      permisosDeUsuario(u.rolId === rol.id ? { ...u, rol: { permisos } } : u);
    const ganan = new Set<string>();
    const pierden = new Set<string>();
    const delRol = activos.filter((u) => u.rolId === rol.id);
    for (const persona of delRol) {
      const antes = permisosDeUsuario(persona);
      const despues = conCambio(persona);
      for (const p of despues) if (!antes.includes(p)) ganan.add(p);
      for (const p of antes) if (!despues.includes(p)) pierden.add(p);
    }
    // R78 simulado en memoria: si quedaría alguien que gobierne el hotel.
    const rompeGobierno = !activos.some((u) => {
      const efectivos = conCambio(u);
      return (
        u.activo &&
        efectivos.includes(PERMISOS.USUARIOS_GESTIONAR) &&
        efectivos.includes(PERMISOS.ROLES_GESTIONAR)
      );
    });
    return {
      personasAfectadas: delRol.length,
      ganan: [...ganan],
      pierden: [...pierden],
      rompeGobierno,
      motivo: rompeGobierno ? MENSAJE_GOBIERNO : null,
      errores: validarPermisos(permisos),
    };
  }

  // R79: un rol con personas se elimina moviéndolas a otro, en la misma
  // transacción; el último rol del hotel no se elimina.
  async eliminar(
    hotelId: string,
    id: string,
    reasignarA: string | undefined,
    quien: UsuarioAutenticado,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await bloquearHotel(tx, hotelId);
      const rol = await this.exigirRol(tx, hotelId, id);
      if ((await tx.rolHotel.count({ where: { hotelId } })) === 1) {
        throw new BadRequestException('No se puede eliminar el último rol del hotel');
      }
      const personas = await tx.usuario.findMany({
        where: { rolId: id },
        select: { id: true },
      });
      if (personas.length > 0) {
        if (!reasignarA) {
          throw new BadRequestException(
            `El rol tiene ${personas.length} persona(s): elige a qué rol moverlas`,
          );
        }
        if (reasignarA === id) {
          throw new BadRequestException('Elige un rol distinto al que se elimina');
        }
        const destino = await this.exigirRol(tx, hotelId, reasignarA);
        this.exigirQuePuedaOtorgar(quien, destino.permisos);
        const ahora = this.reloj.ahora();
        await tx.usuario.updateMany({ where: { rolId: id }, data: { rolId: destino.id } });
        await tx.eventoUsuario.createMany({
          data: personas.map((p) => ({
            usuarioId: p.id,
            actorId: quien.id,
            tipo: 'rol_cambiado' as const,
            fecha: ahora,
            detalle: {
              antes: { rol: rol.nombre },
              despues: { rol: destino.nombre },
              motivo: 'rol eliminado',
            },
          })),
        });
      }
      await this.auditar(tx, id, hotelId, quien.id, 'eliminado', rol, null);
      await tx.rolHotel.delete({ where: { id } });
      await exigirGobierno(tx, hotelId);
    });
  }

  // ── Ayudantes ─────────────────────────────────────────────────────────

  private async exigirRol(tx: Transaccion | PrismaService, hotelId: string, id: string) {
    const rol = await tx.rolHotel.findFirst({ where: { id, hotelId } });
    if (!rol) throw new NotFoundException('Rol no encontrado');
    return rol;
  }

  private exigirValidos(permisos: string[]) {
    const errores = validarPermisos(permisos);
    if (errores.length > 0) throw new BadRequestException(errores.join('. '));
  }

  // R76: nadie da lo que no tiene.
  private exigirQuePuedaOtorgar(quien: UsuarioAutenticado, permisos: readonly string[]) {
    const faltan = puedeOtorgar(quien.permisos, permisos);
    if (faltan.length > 0) {
      throw new ForbiddenException(
        `No puedes otorgar un permiso que no tienes: ${faltan.map(etiquetaPermiso).join(', ')}`,
      );
    }
  }

  private async conNombreUnico<T>(operacion: () => Promise<T>) {
    try {
      return await operacion();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === CODIGO_PRISMA_UNICO
      ) {
        throw new ConflictException('Ya hay un rol con ese nombre en el hotel');
      }
      throw error;
    }
  }

  // R80: todo cambio de un rol queda con su antes y su después.
  private auditar(
    tx: Transaccion,
    rolId: string,
    hotelId: string,
    actorId: string,
    tipo: 'creado' | 'editado' | 'eliminado',
    antes: { nombre: string; permisos: string[] } | null,
    despues: { nombre: string; permisos: string[] } | null,
  ) {
    const foto = (r: typeof antes) => (r ? { nombre: r.nombre, permisos: r.permisos } : null);
    return tx.eventoRol.create({
      data: {
        rolId,
        hotelId,
        actorId,
        tipo,
        detalle: { antes: foto(antes), despues: foto(despues) },
        fecha: this.reloj.ahora(),
      },
    });
  }
}
