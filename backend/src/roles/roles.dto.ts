import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

// Un rol nuevo con sus permisos, o la copia de otro (duplicarDe).
export class CrearRolDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  nombre!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  descripcion?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @IsString({ each: true })
  permisos?: string[];

  @IsOptional()
  @IsUUID()
  duplicarDe?: string;
}

export class ActualizarRolDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  descripcion?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @IsString({ each: true })
  permisos?: string[];
}

export class VistaPreviaRolDto {
  @IsArray()
  @ArrayMaxSize(60)
  @IsString({ each: true })
  permisos!: string[];
}

// Al eliminar un rol con personas, a qué rol se mueven.
export class EliminarRolDto {
  @IsOptional()
  @IsUUID()
  reasignarA?: string;
}
