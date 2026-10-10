import { Transform } from 'class-transformer';
import { IsEmail, IsString, MinLength } from 'class-validator';

// Política mínima de contraseñas del MVP.
export const LARGO_MINIMO_CONTRASENA = 8;

// Los correos se comparan sin importar mayúsculas ni espacios.
export const NormalizarEmail = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value));

export class LoginDto {
  @NormalizarEmail()
  @IsEmail()
  email!: string;

  @IsString()
  contrasena!: string;
}

export class CambiarContrasenaDto {
  @IsString()
  actual!: string;

  @IsString()
  @MinLength(LARGO_MINIMO_CONTRASENA)
  nueva!: string;
}
