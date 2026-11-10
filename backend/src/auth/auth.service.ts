import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Usuario } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { urlPublicaApp } from '../comun/urls-publicas';
import { CorreoService } from '../correo/correo.service';
import { plantillaContrasenaCambiada, plantillaRecuperacion } from '../correo/plantillas';
import { Reloj } from '../hotel/reloj';
import { PrismaService } from '../prisma/prisma.service';
import { cifrarContrasena, problemaConContrasena, verificarContrasena } from './contrasenas';
import { UsuarioAutenticado } from './decoradores';
import { SELECCION_PERMISOS, permisosDeUsuario } from './permisos-efectivos';
import { MENSAJE_HOTEL_SUSPENDIDO } from './guardia-acceso';

export const MENSAJE_TEMPORAL_VENCIDA =
  'Tu contraseña temporal venció. Pide que te la reenvíen o usa ¿Olvidaste tu contraseña?';
const MENSAJE_ENLACE_INVALIDO =
  'El enlace para restablecer la contraseña venció o ya se usó: pide uno nuevo';

// R73: vigencia del enlace de "¿Olvidaste tu contraseña?" (30 minutos por defecto).
export const minutosRecuperacion = () => Number(process.env.RECUPERACION_MINUTOS || 30);

// Solo se guarda el SHA-256 del token: quien lea la base no puede usar el enlace.
export const hashDeToken = (token: string) => createHash('sha256').update(token).digest('hex');

// Lo que el frontend necesita saber del usuario: nunca incluye el hash.
export function perfilDe(usuario: UsuarioAutenticado) {
  return {
    id: usuario.id,
    nombre: usuario.nombre,
    email: usuario.email,
    // Plan 19: el tipo, el rol de su hotel y los permisos efectivos (R75).
    tipo: usuario.tipo,
    rol: usuario.rol,
    hotelId: usuario.hotelId,
    permisos: usuario.permisos,
    // R71: con una contraseña temporal, el frontend pide crear la propia.
    debeCambiarContrasena: usuario.debeCambiarContrasena,
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly reloj: Reloj,
    private readonly correo: CorreoService,
  ) {}

  async login(email: string, contrasena: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { email },
      include: { hotel: { select: { activo: true } } },
    });
    const valida =
      usuario !== null && (await verificarContrasena(contrasena, usuario.contrasenaHash));

    // El mismo mensaje para correo inexistente, contraseña incorrecta o usuario
    // desactivado: no se le revela a un atacante qué correos existen.
    if (!usuario || !valida || !usuario.activo) {
      throw new UnauthorizedException('Correo o contraseña incorrectos');
    }
    // Con la contraseña correcta sí se dice por qué no entra: el hotel está suspendido.
    if (usuario.hotel && !usuario.hotel.activo) {
      throw new UnauthorizedException(MENSAJE_HOTEL_SUSPENDIDO);
    }
    // R70: la contraseña temporal vence (72 h por defecto).
    if (this.temporalVencida(usuario)) {
      throw new UnauthorizedException(MENSAJE_TEMPORAL_VENCIDA);
    }
    return this.sesion(usuario);
  }

  // R71/R72: el cambio voluntario y el obligatorio (con la temporal como
  // "actual"). Cierra las demás sesiones (R74) y devuelve un token nuevo.
  async cambiarContrasena(idUsuario: string, actual: string, nueva: string) {
    const usuario = await this.prisma.usuario.findUniqueOrThrow({ where: { id: idUsuario } });
    if (!(await verificarContrasena(actual, usuario.contrasenaHash))) {
      throw new BadRequestException('La contraseña actual no es correcta');
    }
    if (this.temporalVencida(usuario)) {
      throw new BadRequestException(MENSAJE_TEMPORAL_VENCIDA);
    }
    this.exigirPolitica(nueva, usuario.email, usuario.debeCambiarContrasena ? actual : null);
    if (nueva === actual) {
      throw new BadRequestException('La contraseña nueva debe ser distinta de la actual');
    }

    const ahora = this.reloj.ahora();
    const actualizado = await this.prisma.$transaction(async (tx) => {
      const cambiado = await tx.usuario.update({
        where: { id: idUsuario },
        data: { ...(await this.datosDeContrasenaNueva(nueva, ahora)) },
      });
      await tx.eventoUsuario.create({
        data: {
          usuarioId: idUsuario,
          actorId: idUsuario,
          tipo: 'contrasena_cambiada',
          fecha: ahora,
        },
      });
      return cambiado;
    });
    await this.avisarCambio(actualizado, ahora);
    return this.sesion(actualizado);
  }

  // R73: "¿Olvidaste tu contraseña?". Responde lo mismo exista o no el correo
  // (no revela quién tiene cuenta); solo envía el enlace a un usuario activo
  // de un hotel activo. Un enlace nuevo invalida los anteriores.
  async recuperar(email: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { email },
      include: { hotel: { select: { activo: true } } },
    });
    if (!usuario?.activo || (usuario.hotel && !usuario.hotel.activo)) return;

    const ahora = this.reloj.ahora();
    const token = randomBytes(32).toString('base64url');
    await this.prisma.$transaction(async (tx) => {
      await tx.tokenRecuperacion.updateMany({
        where: { usuarioId: usuario.id, usadoEn: null },
        data: { usadoEn: ahora },
      });
      await tx.tokenRecuperacion.create({
        data: {
          usuarioId: usuario.id,
          hashToken: hashDeToken(token),
          venceEn: new Date(ahora.getTime() + minutosRecuperacion() * 60_000),
        },
      });
      await tx.eventoUsuario.create({
        data: { usuarioId: usuario.id, tipo: 'recuperacion_solicitada', fecha: ahora },
      });
    });
    await this.correo.enviar({
      hotelId: usuario.hotelId,
      usuarioId: usuario.id,
      plantilla: 'recuperacion',
      para: usuario.email,
      nombre: usuario.nombre,
      contenido: plantillaRecuperacion({
        marca: await this.correo.marcaDe(usuario.hotelId),
        nombre: usuario.nombre,
        enlace: `${urlPublicaApp()}/restablecer?token=${token}`,
        minutos: minutosRecuperacion(),
      }),
    });
  }

  // R73: el enlace se usa una sola vez. La marca de "usado" es una
  // actualización condicionada en la transacción: de dos usos simultáneos,
  // solo uno la logra.
  async restablecer(token: string, nueva: string) {
    const registro = await this.prisma.tokenRecuperacion.findUnique({
      where: { hashToken: hashDeToken(token) },
      include: { usuario: { include: { hotel: { select: { activo: true } } } } },
    });
    if (!registro) throw new BadRequestException(MENSAJE_ENLACE_INVALIDO);
    const { usuario } = registro;
    // La política se revisa antes de gastar el enlace: si no la cumple, puede corregirla.
    this.exigirPolitica(nueva, usuario.email, null);

    const ahora = this.reloj.ahora();
    const actualizado = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.tokenRecuperacion.updateMany({
        where: { id: registro.id, usadoEn: null, venceEn: { gt: ahora } },
        data: { usadoEn: ahora },
      });
      if (count === 0 || !usuario.activo || (usuario.hotel && !usuario.hotel.activo)) {
        throw new BadRequestException(MENSAJE_ENLACE_INVALIDO);
      }
      const cambiado = await tx.usuario.update({
        where: { id: usuario.id },
        data: await this.datosDeContrasenaNueva(nueva, ahora),
      });
      await tx.eventoUsuario.create({
        data: { usuarioId: usuario.id, tipo: 'contrasena_restablecida', fecha: ahora },
      });
      return cambiado;
    });
    await this.avisarCambio(actualizado, ahora);
  }

  // ── Ayudantes ─────────────────────────────────────────────────────────

  private async sesion(usuario: Usuario) {
    const { rol, ...permisos } = await this.prisma.usuario.findUniqueOrThrow({
      where: { id: usuario.id },
      select: SELECCION_PERMISOS,
    });
    return {
      // R74: la versión en el token permite revocar las sesiones.
      token: await this.jwt.signAsync({ sub: usuario.id, ver: usuario.versionSesion }),
      usuario: perfilDe({
        ...usuario,
        tipo: permisos.tipo,
        rol: rol ? { id: rol.id, nombre: rol.nombre } : null,
        permisos: permisosDeUsuario({ ...permisos, rol }),
      }),
    };
  }

  private temporalVencida(usuario: Usuario) {
    return (
      usuario.debeCambiarContrasena &&
      usuario.contrasenaTemporalVenceEn !== null &&
      usuario.contrasenaTemporalVenceEn <= this.reloj.ahora()
    );
  }

  private exigirPolitica(nueva: string, email: string, temporal: string | null) {
    const problema = problemaConContrasena(nueva, { email, temporal });
    if (problema) throw new BadRequestException(problema);
  }

  // Una contraseña propia: sin temporal pendiente y con las sesiones cerradas.
  private async datosDeContrasenaNueva(nueva: string, ahora: Date) {
    return {
      contrasenaHash: await cifrarContrasena(nueva),
      debeCambiarContrasena: false,
      contrasenaTemporalVenceEn: null,
      contrasenaCambiadaEn: ahora,
      versionSesion: { increment: 1 },
    };
  }

  private async avisarCambio(usuario: Usuario, fecha: Date) {
    await this.correo.enviar({
      hotelId: usuario.hotelId,
      usuarioId: usuario.id,
      plantilla: 'contrasena_cambiada',
      para: usuario.email,
      nombre: usuario.nombre,
      contenido: plantillaContrasenaCambiada({
        marca: await this.correo.marcaDe(usuario.hotelId),
        nombre: usuario.nombre,
        fecha,
      }),
    });
  }
}
