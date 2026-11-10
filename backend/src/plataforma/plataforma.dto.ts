import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { MarcaHotelDto } from '../hotel/marca';
import { NormalizarEmail } from '../auth/auth.dto';
import { NOMBRES_PLANTILLAS, NombrePlantilla } from '../auth/permisos';

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
  @Type(() => PersonaInicialDto)
  personas!: PersonaInicialDto[];
}

// Plan 19: el hotel aún no tiene roles: cada persona inicial elige una
// plantilla (el rol con ese nombre se crea con el hotel).
export class PersonaInicialDto {
  @IsString()
  @IsNotEmpty()
  nombre!: string;

  @NormalizarEmail()
  @IsEmail()
  email!: string;

  @IsIn(NOMBRES_PLANTILLAS)
  plantilla!: NombrePlantilla;
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
