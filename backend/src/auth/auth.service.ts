import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Usuario } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { cifrarContrasena, verificarContrasena } from './contrasenas';
import { PERMISOS_POR_ROL } from './permisos';
import { MENSAJE_HOTEL_SUSPENDIDO } from './guardia-acceso';

// Lo que el frontend necesita saber del usuario: nunca incluye el hash.
export function perfilDe(usuario: Pick<Usuario, 'id' | 'nombre' | 'email' | 'rol' | 'hotelId'>) {
  return {
    id: usuario.id,
    nombre: usuario.nombre,
    email: usuario.email,
    rol: usuario.rol,
    hotelId: usuario.hotelId,
    permisos: PERMISOS_POR_ROL[usuario.rol],
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
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

    return {
      token: await this.jwt.signAsync({ sub: usuario.id }),
      usuario: perfilDe(usuario),
    };
  }

  async cambiarContrasena(idUsuario: string, actual: string, nueva: string) {
    const usuario = await this.prisma.usuario.findUniqueOrThrow({ where: { id: idUsuario } });
    if (!(await verificarContrasena(actual, usuario.contrasenaHash))) {
      throw new BadRequestException('La contraseña actual no es correcta');
    }
    await this.prisma.usuario.update({
      where: { id: idUsuario },
      data: { contrasenaHash: await cifrarContrasena(nueva) },
    });
  }
}
