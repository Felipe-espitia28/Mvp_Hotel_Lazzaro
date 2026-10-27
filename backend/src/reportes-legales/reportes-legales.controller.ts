import { ApiTags } from '@nestjs/swagger';
import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ContextoHotel, HotelActual, RequierePermiso } from '../auth/decoradores';
import { PERMISOS } from '../auth/permisos';
import { aCsv, type Columna } from './csv';
import { COLUMNAS_SIRE, COLUMNAS_TRA } from './columnas';
import { RangoReporteDto } from './reportes-legales.dto';
import { ReportesLegalesService } from './reportes-legales.service';

// A-6: los datos listos para la TRA y el SIRE. Envío automático: hoja de ruta (C-4).
@ApiTags('Reportes legales')
@Controller('reportes-legales')
@RequierePermiso(PERMISOS.REPORTES_LEGALES)
export class ReportesLegalesController {
  constructor(private readonly reportes: ReportesLegalesService) {}

  @Get('tra')
  async tra(
    @HotelActual() hotel: ContextoHotel,
    @Query() q: RangoReporteDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const filas = await this.reportes.tra(hotel, q.desde, q.hasta);
    return q.formato === 'csv'
      ? enviarCsv(res, `tra-${q.desde}-${q.hasta}`, COLUMNAS_TRA, filas)
      : filas;
  }

  @Get('sire')
  async sire(
    @HotelActual() hotel: ContextoHotel,
    @Query() q: RangoReporteDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const filas = await this.reportes.sire(hotel, q.desde, q.hasta);
    return q.formato === 'csv'
      ? enviarCsv(res, `sire-${q.desde}-${q.hasta}`, COLUMNAS_SIRE, filas)
      : filas;
  }

  @Get('pendientes')
  pendientes(@HotelActual() hotel: ContextoHotel, @Query() q: RangoReporteDto) {
    return this.reportes.pendientes(hotel, q.desde, q.hasta);
  }
}

function enviarCsv<T>(res: Response, nombre: string, columnas: Columna<T>[], filas: T[]) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nombre}.csv"`);
  return aCsv(columnas, filas);
}
