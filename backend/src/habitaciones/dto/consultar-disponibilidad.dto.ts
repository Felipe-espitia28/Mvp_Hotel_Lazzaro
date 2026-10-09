import { IsDateString } from 'class-validator';

// Query params del endpoint de disponibilidad.
export class ConsultarDisponibilidadDto {
  @IsDateString()
  desde!: string;

  @IsDateString()
  hasta!: string;
}
