import { RolUsuario } from '@prisma/client';
import { IsBoolean, IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { LARGO_MINIMO_CONTRASENA, NormalizarEmail } from '../auth/dto';

export class CrearUsuarioDto {
  @IsString()
  @IsNotEmpty()
  nombre!: string;

  @NormalizarEmail()
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(LARGO_MINIMO_CONTRASENA)
  contrasena!: string;

  @IsEnum(RolUsuario)
  rol!: RolUsuario;
}

// El correo no se edita: identifica al usuario en el login.
export class ActualizarUsuarioDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nombre?: string;

  @IsOptional()
  @IsEnum(RolUsuario)
  rol?: RolUsuario;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class RestablecerContrasenaDto {
  @IsString()
  @MinLength(LARGO_MINIMO_CONTRASENA)
  nueva!: string;
}
