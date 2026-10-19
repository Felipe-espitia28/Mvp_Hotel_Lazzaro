import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { RolUsuario } from '@prisma/client';
import { Permiso } from './permisos';
import { PoliticasHotel } from '../hotel/politicas';
import { ConfiguracionTemporadas } from '../tarifas/temporadas';

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
  // null solo para el rol plataforma (Consola Lazaro).
  hotelId: string | null;
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
