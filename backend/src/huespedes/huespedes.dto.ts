import { IsNotEmpty, IsString } from 'class-validator';

export class BuscarHuespedesDto {
  /** Parte del nombre o inicio del número de documento. */
  @IsString()
  @IsNotEmpty()
  buscar!: string;
}
