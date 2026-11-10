import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { LARGO_MINIMO_CONTRASENA } from './contrasenas';

// R72: el largo se revisa aquí; el resto de la política, en el servicio
// (problemaConContrasena), que conoce el correo y la temporal.
export { LARGO_MINIMO_CONTRASENA };

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
  /** La contraseña actual (la temporal, en el primer ingreso). */
  @IsString()
  actual!: string;

  @IsString()
  @MinLength(LARGO_MINIMO_CONTRASENA)
  @MaxLength(200)
  nueva!: string;
}

// Plan 18: "¿Olvidaste tu contraseña?".
export class RecuperarDto {
  @NormalizarEmail()
  @IsEmail()
  email!: string;
}

export class RestablecerDto {
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token!: string;

  @IsString()
  @MinLength(LARGO_MINIMO_CONTRASENA)
  @MaxLength(200)
  nueva!: string;
}
