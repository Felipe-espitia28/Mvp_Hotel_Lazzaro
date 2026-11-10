import {
  BadRequestException,
  ConflictException,
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
  rol: true,
  activo: true,
  createdAt: true,
  // Plan 18: "Pendiente de activar" mientras no cambie la temporal.
  debeCambiarContrasena: true,
} as const;

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
  listar(hotelId: string) {
    return this.prisma.usuario.findMany({
      where: { hotelId },
      select: CAMPOS_PUBLICOS,
      orderBy: [{ activo: 'desc' }, { nombre: 'asc' }],
    });
  }

  // R70: nadie escribe la contraseña de otro. Se genera una temporal y se
  // envía al correo; si el correo falla, el usuario queda creado igual
  // (correoEnviado: false) y se le reenvían las credenciales.
  async crear(hotelId: string, dto: CrearUsuarioDto, actorId: string) {
    const ahora = this.reloj.ahora();
    const { temporal, venceEn, datos } = await credencialesTemporales(ahora);
    let usuario;
    try {
      usuario = await this.prisma.$transaction(async (tx) => {
        const creado = await tx.usuario.create({
          data: { hotelId, nombre: dto.nombre, email: dto.email, rol: dto.rol, ...datos },
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
    return { ...usuario, correoEnviado };
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

  async actualizar(
    hotelId: string,
    id: string,
    dto: ActualizarUsuarioDto,
    quien: UsuarioAutenticado,
  ) {
    const usuario = await this.buscar(hotelId, id);

    // Un administrador no puede desactivarse ni quitarse el rol. Como quien
    // gestiona usuarios siempre es un admin activo, esto garantiza además que
    // el sistema nunca se quede sin administradores.
    if (id === quien.id && (dto.activo === false || (dto.rol && dto.rol !== usuario.rol))) {
      throw new BadRequestException('No puedes desactivarte ni cambiar tu propio rol');
    }

    return this.prisma.$transaction(async (tx) => {
      const actualizado = await tx.usuario.update({
        where: { id },
        data: dto,
        select: CAMPOS_PUBLICOS,
      });
      // El bloqueo inmediato ya existe (R32); queda en la auditoría de la cuenta.
      if (dto.activo === false && usuario.activo) {
        await tx.eventoUsuario.create({
          data: {
            usuarioId: id,
            actorId: quien.id,
            tipo: 'desactivado',
            fecha: this.reloj.ahora(),
          },
        });
      }
      return actualizado;
    });
  }

  private async buscar(hotelId: string, id: string) {
    const usuario = await this.prisma.usuario.findFirst({ where: { id, hotelId } });
    if (!usuario) {
      throw new NotFoundException('Usuario no encontrado');
    }
    return usuario;
  }
}
