import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { NormalizarEmail } from '../auth/auth.dto';

// Plan 19: ajustes de una persona sobre los permisos de su rol (R75).
class AjustesDePermisosDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @IsString({ each: true })
  permisosAgregados?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @IsString({ each: true })
  permisosQuitados?: string[];
}

// El rol es uno de los del hotel (plan 19). El acceso a la Consola no se da
// desde aquí: nadie de un hotel puede darse acceso a la plataforma.
export class CrearUsuarioDto extends AjustesDePermisosDto {
  @IsString()
  @IsNotEmpty()
  nombre!: string;

  @NormalizarEmail()
  @IsEmail()
  email!: string;

  @IsUUID()
  rolId!: string;
}

// El correo no se edita: identifica al usuario en el login.
export class ActualizarUsuarioDto extends AjustesDePermisosDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nombre?: string;

  @IsOptional()
  @IsUUID()
  rolId?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
