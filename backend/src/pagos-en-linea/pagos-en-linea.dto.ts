import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export class CrearLinkDePagoDto {
  /** En pesos. Por defecto, el anticipo sugerido pendiente o el saldo. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  monto?: number;
}

// Las 4 llaves de la cuenta de Wompi del hotel (solo de pruebas, por ahora).
export class LlavesWompiDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  llavePublica!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  llavePrivada!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  secretoEventos!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  secretoIntegridad!: string;
}

// El botón que se pulsó en la página de pago simulada.
export class DecisionSimuladaDto {
  @IsBoolean()
  aprobar!: boolean;
}
