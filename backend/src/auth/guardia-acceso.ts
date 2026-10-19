import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { CLAVE_PERMISO, CLAVE_PUBLICO, ContextoHotel, UsuarioAutenticado } from './decoradores';
import { Permiso, tienePermiso } from './permisos';
import { contextoDeHotel } from '../hotel/contexto';

export const MENSAJE_HOTEL_SUSPENDIDO =
  'El acceso de este hotel está suspendido. Comunícate con Lazaro Software.';

// Guardia global: se aplica a todos los endpoints.
// 1. Autenticación: exige un token válido de un usuario que siga activo.
// 2. Autorización: si el endpoint pide un permiso, el rol debe tenerlo.
@Injectable()
export class GuardiaAcceso implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(contexto: ExecutionContext) {
    const objetivos = [contexto.getHandler(), contexto.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(CLAVE_PUBLICO, objetivos)) {
      return true;
    }

    const peticion = contexto.switchToHttp().getRequest();
    const { usuario, hotel } = await this.autenticar(peticion.headers.authorization);
    peticion.usuario = usuario;
    peticion.hotel = hotel;

    const permiso = this.reflector.getAllAndOverride<Permiso>(CLAVE_PERMISO, objetivos);
    if (permiso && !tienePermiso(usuario.rol, permiso)) {
      throw new ForbiddenException('Tu rol no tiene permiso para esta acción');
    }
    return true;
  }

  private async autenticar(
    cabecera?: string,
  ): Promise<{ usuario: UsuarioAutenticado; hotel: ContextoHotel | undefined }> {
    const [tipo, token] = cabecera?.split(' ') ?? [];
    if (tipo !== 'Bearer' || !token) {
      throw new UnauthorizedException('Debes iniciar sesión');
    }

    let idUsuario: string;
    try {
      idUsuario = (await this.jwt.verifyAsync<{ sub: string }>(token)).sub;
    } catch {
      throw new UnauthorizedException('La sesión no es válida o expiró');
    }

    // Se consulta el usuario en cada petición (y no solo se confía en el token)
    // para que desactivarlo o cambiarle el rol tenga efecto inmediato.
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: idUsuario },
      select: {
        id: true,
        nombre: true,
        email: true,
        rol: true,
        activo: true,
        hotelId: true,
        hotel: { select: { id: true, activo: true, politicas: true } },
      },
    });
    if (!usuario?.activo) {
      throw new UnauthorizedException('El usuario no existe o está desactivado');
    }
    // Suspender un hotel corta el acceso de todo su personal de inmediato.
    if (usuario.hotel && !usuario.hotel.activo) {
      throw new UnauthorizedException(MENSAJE_HOTEL_SUSPENDIDO);
    }

    const { activo: _activo, hotel, ...autenticado } = usuario;
    return { usuario: autenticado, hotel: hotel ? contextoDeHotel(hotel) : undefined };
  }
}
