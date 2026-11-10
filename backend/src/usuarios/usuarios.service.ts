import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { cifrarContrasena, generarContrasenaTemporal } from '../auth/contrasenas';
import { UsuarioAutenticado } from '../auth/decoradores';
import { CorreoService } from '../correo/correo.service';
import { plantillaCredenciales } from '../correo/plantillas';
import { Reloj } from '../hotel/reloj';
import { ActualizarUsuarioDto, CrearUsuarioDto } from './usuarios.dto';
import {
  SELECCION_PERMISOS,
  etiquetaPermiso,
  permisosDeUsuario,
  permisosEfectivos,
  puedeOtorgar,
  requisitosFaltantes,
  validarPermisos,
} from '../auth/permisos-efectivos';
import { bloquearHotel, exigirGobierno } from '../roles/gobierno';

type Transaccion = Prisma.TransactionClient;
const ajustesComoLista = (a: { permisosAgregados: string[]; permisosQuitados: string[] }) =>
  [a.permisosAgregados, a.permisosQuitados] as const;

// R70: la contraseña temporal vence a las 72 h (configurable).
export const horasTemporal = () => Number(process.env.CONTRASENA_TEMPORAL_HORAS || 72);

// Una contraseña temporal y lo que se guarda de ella (solo su hash). La usan
// el alta (aquí y en la Consola) y el reenvío de credenciales.
export async function credencialesTemporales(ahora: Date) {
  const temporal = generarContrasenaTemporal();
  const venceEn = new Date(ahora.getTime() + horasTemporal() * 3_600_000);
  return {
    temporal,
    venceEn,
    datos: {
      contrasenaHash: await cifrarContrasena(temporal),
      debeCambiarContrasena: true,
      contrasenaTemporalVenceEn: venceEn,
    },
  };
}

// Campos que se exponen de un usuario: nunca el hash de la contraseña.
const CAMPOS_PUBLICOS = {
  id: true,
  nombre: true,
  email: true,
  activo: true,
  createdAt: true,
  // Plan 18: "Pendiente de activar" mientras no cambie la temporal.
  debeCambiarContrasena: true,
  // Plan 19: su rol, sus ajustes y lo que puede hacer de verdad.
  ...SELECCION_PERMISOS,
} as const;

type UsuarioLeido = Prisma.UsuarioGetPayload<{ select: typeof CAMPOS_PUBLICOS }>;

function presentar(usuario: UsuarioLeido) {
  const { rol, ...resto } = usuario;
  return {
    ...resto,
    rol: rol ? { id: rol.id, nombre: rol.nombre } : null,
    permisosDelRol: rol?.permisos ?? [],
    permisosEfectivos: permisosDeUsuario(usuario),
    tieneAjustes: usuario.permisosAgregados.length + usuario.permisosQuitados.length > 0,
  };
}

const CODIGO_PRISMA_UNICO = 'P2002';

@Injectable()
export class UsuariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reloj: Reloj,
    private readonly correo: CorreoService,
  ) {}

  // Las personas de un hotel. Lo usan su administrador (Gerencia) y el equipo
  // de Lazaro (Consola), siempre con el hotel explícito.
  async listar(hotelId: string) {
    const usuarios = await this.prisma.usuario.findMany({
      where: { hotelId },
      select: CAMPOS_PUBLICOS,
      orderBy: [{ activo: 'desc' }, { nombre: 'asc' }],
    });
    return usuarios.map(presentar);
  }

  // R70: nadie escribe la contraseña de otro. Se genera una temporal y se
  // envía al correo; si el correo falla, el usuario queda creado igual
  // (correoEnviado: false) y se le reenvían las credenciales.
  // Plan 19: con un rol de su hotel y, si hace falta, sus ajustes de permisos.
  async crear(hotelId: string, dto: CrearUsuarioDto, actor: UsuarioAutenticado) {
    const actorId = actor.id;
    const rol = await this.rolDelHotel(this.prisma, hotelId, dto.rolId);
    const ajustes = this.ajustesValidos(
      rol.permisos,
      dto.permisosAgregados ?? [],
      dto.permisosQuitados ?? [],
    );
    this.exigirQuePuedaOtorgar(
      actor,
      permisosEfectivos(rol.permisos, ...ajustesComoLista(ajustes)),
    );
    const ahora = this.reloj.ahora();
    const { temporal, venceEn, datos } = await credencialesTemporales(ahora);
    let usuario;
    try {
      usuario = await this.prisma.$transaction(async (tx) => {
        const creado = await tx.usuario.create({
          data: {
            hotelId,
            nombre: dto.nombre,
            email: dto.email,
            tipo: 'hotel',
            rolId: rol.id,
            ...ajustes,
            ...datos,
          },
          select: CAMPOS_PUBLICOS,
        });
        await tx.eventoUsuario.create({
          data: { usuarioId: creado.id, actorId, tipo: 'creado', fecha: ahora },
        });
        return creado;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === CODIGO_PRISMA_UNICO
      ) {
        throw new ConflictException(`Ya existe un usuario con el correo ${dto.email}`);
      }
      throw error;
    }
    const correoEnviado = await this.enviarCredenciales(
      { ...usuario, hotelId },
      { temporal, venceEn, reenvio: false },
      actorId,
    );
    return { ...presentar(usuario), correoEnviado };
  }

  // R70: el correo con la temporal (después de la transacción: un proveedor
  // lento no la deja abierta). Si sale, queda el evento credenciales_enviadas.
  async enviarCredenciales(
    usuario: { id: string; nombre: string; email: string; hotelId: string | null },
    credenciales: { temporal: string; venceEn: Date; reenvio: boolean },
    actorId: string | null,
  ) {
    const { enviado } = await this.correo.enviar({
      hotelId: usuario.hotelId,
      usuarioId: usuario.id,
      plantilla: credenciales.reenvio ? 'credenciales_reenviadas' : 'credenciales',
      para: usuario.email,
      nombre: usuario.nombre,
      contenido: plantillaCredenciales({
        marca: await this.correo.marcaDe(usuario.hotelId),
        nombre: usuario.nombre,
        email: usuario.email,
        ...credenciales,
      }),
    });
    if (enviado) {
      await this.prisma.eventoUsuario.create({
        data: {
          usuarioId: usuario.id,
          actorId,
          tipo: 'credenciales_enviadas',
          fecha: this.reloj.ahora(),
        },
      });
    }
    return enviado;
  }

  // R70/R74: reemplaza "restablecer contraseña". Una temporal nueva, la
  // anterior deja de servir y las sesiones abiertas se cierran.
  async reenviarCredenciales(hotelId: string, id: string, actorId: string) {
    const usuario = await this.buscar(hotelId, id);
    if (!usuario.activo) {
      throw new BadRequestException('El usuario está desactivado: actívalo antes de reenviar');
    }
    const { temporal, venceEn, datos } = await credencialesTemporales(this.reloj.ahora());
    await this.prisma.usuario.update({
      where: { id },
      data: { ...datos, versionSesion: { increment: 1 } },
    });
    const correoEnviado = await this.enviarCredenciales(
      usuario,
      { temporal, venceEn, reenvio: true },
      actorId,
    );
    return { correoEnviado };
  }

  // Plan 19: nombre, rol, ajustes y estado. Nadie se edita a sí mismo, nadie
  // da lo que no tiene (R76) y el hotel no se queda sin gobierno (R78).
  async actualizar(
    hotelId: string,
    id: string,
    dto: ActualizarUsuarioDto,
    quien: UsuarioAutenticado,
  ) {
    const cambiaPermisos =
      dto.rolId !== undefined ||
      dto.permisosAgregados !== undefined ||
      dto.permisosQuitados !== undefined;
    if (id === quien.id && (dto.activo === false || cambiaPermisos)) {
      throw new BadRequestException(
        'No puedes desactivarte ni cambiar tu propio rol o tus permisos',
      );
    }

    const actualizado = await this.prisma.$transaction(async (tx) => {
      await bloquearHotel(tx, hotelId);
      const antes = await tx.usuario.findFirst({
        where: { id, hotelId },
        select: CAMPOS_PUBLICOS,
      });
      if (!antes) throw new NotFoundException('Usuario no encontrado');
      const ahora = this.reloj.ahora();

      let datosPermisos = {};
      if (cambiaPermisos) {
        const rol = dto.rolId
          ? await this.rolDelHotel(tx, hotelId, dto.rolId)
          : { id: antes.rol!.id, nombre: antes.rol!.nombre, permisos: antes.rol!.permisos };
        const ajustes = this.ajustesValidos(
          rol.permisos,
          dto.permisosAgregados ?? antes.permisosAgregados,
          dto.permisosQuitados ?? antes.permisosQuitados,
        );
        // Conservar un permiso no es darlo: cuenta solo lo que gana.
        const previos = permisosDeUsuario(antes);
        const nuevos = permisosEfectivos(rol.permisos, ...ajustesComoLista(ajustes));
        this.exigirQuePuedaOtorgar(
          quien,
          nuevos.filter((p) => !previos.includes(p)),
        );
        datosPermisos = { rolId: rol.id, ...ajustes };
        if (rol.id !== antes.rol?.id) {
          await tx.eventoUsuario.create({
            data: {
              usuarioId: id,
              actorId: quien.id,
              tipo: 'rol_cambiado',
              fecha: ahora,
              detalle: { antes: { rol: antes.rol?.nombre ?? null }, despues: { rol: rol.nombre } },
            },
          });
        }
        const mismosAjustes =
          [...ajustes.permisosAgregados].sort().join() ===
            [...antes.permisosAgregados].sort().join() &&
          [...ajustes.permisosQuitados].sort().join() === [...antes.permisosQuitados].sort().join();
        if (!mismosAjustes) {
          await tx.eventoUsuario.create({
            data: {
              usuarioId: id,
              actorId: quien.id,
              tipo: 'permisos_ajustados',
              fecha: ahora,
              detalle: {
                antes: {
                  agregados: antes.permisosAgregados,
                  quitados: antes.permisosQuitados,
                },
                despues: {
                  agregados: ajustes.permisosAgregados,
                  quitados: ajustes.permisosQuitados,
                },
              },
            },
          });
        }
      }

      const usuario = await tx.usuario.update({
        where: { id },
        data: {
          ...(dto.nombre !== undefined && { nombre: dto.nombre }),
          ...(dto.activo !== undefined && { activo: dto.activo }),
          ...datosPermisos,
        },
        select: CAMPOS_PUBLICOS,
      });
      // El bloqueo inmediato ya existe (R32); queda en la auditoría de la cuenta.
      if (dto.activo === false && antes.activo) {
        await tx.eventoUsuario.create({
          data: { usuarioId: id, actorId: quien.id, tipo: 'desactivado', fecha: ahora },
        });
      }
      await exigirGobierno(tx, hotelId);
      return usuario;
    });
    return presentar(actualizado);
  }

  // Los roles del hotel para elegir uno (la Consola los ve; no los edita).
  roles(hotelId: string) {
    return this.prisma.rolHotel.findMany({
      where: { hotelId },
      select: { id: true, nombre: true, descripcion: true, permisos: true },
      orderBy: { nombre: 'asc' },
    });
  }

  private async rolDelHotel(tx: Transaccion | PrismaService, hotelId: string, rolId: string) {
    const rol = await tx.rolHotel.findFirst({ where: { id: rolId, hotelId } });
    if (!rol) throw new NotFoundException('Rol no encontrado');
    return rol;
  }

  // Los ajustes son del catálogo, no repiten lo que el rol ya dice (agregar
  // lo que tiene o quitar lo que no tiene no cambia nada y se descarta) y el
  // resultado cumple los requisitos de cada permiso.
  private ajustesValidos(delRol: string[], agregados: string[], quitados: string[]) {
    const errores = [...validarPermisos(agregados, false), ...validarPermisos(quitados, false)];
    if (errores.length > 0) throw new BadRequestException(errores.join('. '));
    const ajustes = {
      permisosAgregados: agregados.filter((p) => !delRol.includes(p) && !quitados.includes(p)),
      permisosQuitados: quitados.filter((p) => delRol.includes(p)),
    };
    const faltan = requisitosFaltantes(
      permisosEfectivos(delRol, ajustes.permisosAgregados, ajustes.permisosQuitados),
    );
    if (faltan.length > 0) throw new BadRequestException(faltan.join('. '));
    return ajustes;
  }

  // R76: nadie da lo que no tiene. La Consola Lazaro (el proveedor) está exenta.
  private exigirQuePuedaOtorgar(actor: UsuarioAutenticado, permisos: readonly string[]) {
    if (actor.tipo === 'plataforma') return;
    const faltan = puedeOtorgar(actor.permisos, permisos);
    if (faltan.length > 0) {
      throw new ForbiddenException(
        `No puedes otorgar un permiso que no tienes: ${faltan.map(etiquetaPermiso).join(', ')}`,
      );
    }
  }

  private async buscar(hotelId: string, id: string) {
    const usuario = await this.prisma.usuario.findFirst({ where: { id, hotelId } });
    if (!usuario) {
      throw new NotFoundException('Usuario no encontrado');
    }
    return usuario;
  }
}
