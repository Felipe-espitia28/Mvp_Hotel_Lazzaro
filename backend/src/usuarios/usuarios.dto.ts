import { IsBoolean, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { NormalizarEmail } from '../auth/auth.dto';

// Roles del personal de un hotel. El rol plataforma (equipo de Lazaro) no se
// asigna desde aquí: nadie de un hotel puede darse acceso a la Consola.
export const ROLES_DE_HOTEL = ['admin', 'recepcionista', 'housekeeping'] as const;
export type RolDeHotel = (typeof ROLES_DE_HOTEL)[number];

export class CrearUsuarioDto {
  @IsString()
  @IsNotEmpty()
  nombre!: string;

  @NormalizarEmail()
  @IsEmail()
  email!: string;

  @IsIn(ROLES_DE_HOTEL)
  rol!: RolDeHotel;
}

// El correo no se edita: identifica al usuario en el login.
export class ActualizarUsuarioDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nombre?: string;

  @IsOptional()
  @IsIn(ROLES_DE_HOTEL)
  rol?: RolDeHotel;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
