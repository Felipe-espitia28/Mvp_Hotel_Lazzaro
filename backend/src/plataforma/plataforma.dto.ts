import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { MarcaHotelDto } from '../hotel/marca';
import { CrearUsuarioDto } from '../usuarios/usuarios.dto';

// slug: minúsculas, números y guiones (sol-caribe). Va en la URL del login.
export const PATRON_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Alta de un hotel cliente desde la Consola Lazaro: sus datos, su marca
// inicial y las personas que tendrán acceso (al menos un administrador).
export class CrearHotelDto extends MarcaHotelDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  nombre!: string;

  @Matches(PATRON_SLUG, { message: 'El identificador solo admite minúsculas, números y guiones' })
  @MaxLength(40)
  slug!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  ciudad?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  nit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CrearUsuarioDto)
  personas!: CrearUsuarioDto[];
}

// Suspender / reactivar el hotel o corregir sus datos.
export class ActualizarHotelDto {
  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  ciudad?: string;
}
