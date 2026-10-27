import { IsDateString, IsIn, IsOptional } from 'class-validator';

// Rango de fechas de un reporte legal (YYYY-MM-DD, ambos incluidos).
export class RangoReporteDto {
  @IsDateString()
  desde!: string;

  @IsDateString()
  hasta!: string;

  /** `csv` descarga el archivo; sin el parámetro, responde JSON (vista previa). */
  @IsOptional()
  @IsIn(['csv'])
  formato?: 'csv';
}
