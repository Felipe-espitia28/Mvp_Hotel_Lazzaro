import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { RolUsuario } from '@prisma/client';
import { Permiso } from './permisos';

export const CLAVE_PUBLICO = 'publico';
export const CLAVE_PERMISO = 'permiso';

// Todo endpoint exige sesión salvo los marcados con @Publico() (p. ej. el login).
export const Publico = () => SetMetadata(CLAVE_PUBLICO, true);

// Además de sesión, exige que el rol del usuario tenga este permiso.
export const RequierePermiso = (permiso: Permiso) => SetMetadata(CLAVE_PERMISO, permiso);

// Datos del usuario que hace la petición, cargados por la GuardiaAcceso.
export interface UsuarioAutenticado {
  id: string;
  nombre: string;
  email: string;
  rol: RolUsuario;
}

export const UsuarioActual = createParamDecorator(
  (_dato: unknown, contexto: ExecutionContext): UsuarioAutenticado =>
    contexto.switchToHttp().getRequest().usuario,
);
