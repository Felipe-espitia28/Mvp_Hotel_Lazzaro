import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { TipoUsuario } from '@prisma/client';
import { Permiso } from './permisos';
import { PoliticasHotel } from '../hotel/politicas';
import { ConfiguracionTemporadas } from '../tarifas/temporadas';

export const CLAVE_PUBLICO = 'publico';
export const CLAVE_PERMISO = 'permiso';

// Todo endpoint exige sesión salvo los marcados con @Publico() (p. ej. el login).
export const Publico = () => SetMetadata(CLAVE_PUBLICO, true);

// R71: quien tiene una contraseña temporal solo puede ver su perfil y
// cambiarla; todo lo demás responde 403 CAMBIO_CONTRASENA_REQUERIDO.
export const CLAVE_SIN_CAMBIO = 'permitido-sin-cambio';
export const PermitidoSinCambio = () => SetMetadata(CLAVE_SIN_CAMBIO, true);
export const CODIGO_CAMBIO_REQUERIDO = 'CAMBIO_CONTRASENA_REQUERIDO';

// Además de sesión, exige que el rol del usuario tenga este permiso.
export const RequierePermiso = (permiso: Permiso) => SetMetadata(CLAVE_PERMISO, permiso);

// Datos del usuario que hace la petición, cargados por la GuardiaAcceso.
export interface UsuarioAutenticado {
  id: string;
  nombre: string;
  email: string;
  // Plan 19: plataforma (Consola Lazaro) o personal de un hotel.
  tipo: TipoUsuario;
  // El rol de su hotel (null para la Consola).
  rol: { id: string; nombre: string } | null;
  // Los permisos efectivos (rol + ajustes), calculados en la guardia (R75).
  permisos: Permiso[];
  // null solo para el rol plataforma (Consola Lazaro).
  hotelId: string | null;
  // Plan 18: tiene una contraseña temporal que aún no cambia.
  debeCambiarContrasena: boolean;
}

export const UsuarioActual = createParamDecorator(
  (_dato: unknown, contexto: ExecutionContext): UsuarioAutenticado =>
    contexto.switchToHttp().getRequest().usuario,
);

// El hotel del usuario que hace la petición, con sus reglas ya resueltas.
// Toda consulta de un servicio filtra por `id`: un hotel nunca ve ni toca
// los datos de otro.
export interface ContextoHotel {
  id: string;
  politicas: PoliticasHotel;
  temporadas: ConfiguracionTemporadas;
}

// Solo el personal de un hotel opera sus datos; el rol plataforma no.
export const HotelActual = createParamDecorator(
  (_dato: unknown, contexto: ExecutionContext): ContextoHotel => {
    const hotel = contexto.switchToHttp().getRequest().hotel as ContextoHotel | undefined;
    if (!hotel) {
      throw new ForbiddenException('Esta acción es solo para el personal de un hotel');
    }
    return hotel;
  },
);
