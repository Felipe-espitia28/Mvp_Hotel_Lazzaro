import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { cifrarContrasena } from '../auth/contrasenas';
import { UsuarioAutenticado } from '../auth/decoradores';
import { ActualizarUsuarioDto, CrearUsuarioDto } from './dto';

// Campos que se exponen de un usuario: nunca el hash de la contraseña.
const CAMPOS_PUBLICOS = {
  id: true,
  nombre: true,
  email: true,
  rol: true,
  activo: true,
  createdAt: true,
} as const;

const CODIGO_PRISMA_UNICO = 'P2002';

@Injectable()
export class UsuariosService {
  constructor(private readonly prisma: PrismaService) {}

  listar() {
    return this.prisma.usuario.findMany({
      select: CAMPOS_PUBLICOS,
      orderBy: [{ activo: 'desc' }, { nombre: 'asc' }],
    });
  }

  async crear(dto: CrearUsuarioDto) {
    try {
      return await this.prisma.usuario.create({
        data: {
          nombre: dto.nombre,
          email: dto.email,
          rol: dto.rol,
          contrasenaHash: await cifrarContrasena(dto.contrasena),
        },
        select: CAMPOS_PUBLICOS,
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
  }

  async actualizar(id: string, dto: ActualizarUsuarioDto, quien: UsuarioAutenticado) {
    const usuario = await this.buscar(id);

    // Un administrador no puede desactivarse ni quitarse el rol. Como quien
    // gestiona usuarios siempre es un admin activo, esto garantiza además que
    // el sistema nunca se quede sin administradores.
    if (id === quien.id && (dto.activo === false || (dto.rol && dto.rol !== usuario.rol))) {
      throw new BadRequestException('No puedes desactivarte ni cambiar tu propio rol');
    }

    return this.prisma.usuario.update({
      where: { id },
      data: dto,
      select: CAMPOS_PUBLICOS,
    });
  }

  async restablecerContrasena(id: string, nueva: string) {
    await this.buscar(id);
    await this.prisma.usuario.update({
      where: { id },
      data: { contrasenaHash: await cifrarContrasena(nueva) },
    });
  }

  private async buscar(id: string) {
    const usuario = await this.prisma.usuario.findUnique({ where: { id } });
    if (!usuario) {
      throw new NotFoundException('Usuario no encontrado');
    }
    return usuario;
  }
}
