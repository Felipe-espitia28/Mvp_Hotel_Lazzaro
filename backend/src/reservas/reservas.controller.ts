import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ReservasService } from './reservas.service';
import { CrearReservaDto } from './dto/crear-reserva.dto';
import { RequierePermiso } from '../auth/decoradores';
import { PERMISOS } from '../auth/permisos';

@Controller('reservas')
export class ReservasController {
  constructor(private readonly reservasService: ReservasService) {}

  @Get()
  @RequierePermiso(PERMISOS.RESERVAS_VER)
  listar() {
    return this.reservasService.listar();
  }

  @Post()
  @RequierePermiso(PERMISOS.RESERVAS_GESTIONAR)
  crear(@Body() dto: CrearReservaDto) {
    return this.reservasService.crear(dto);
  }

  // Normalmente lo ejecuta una tarea programada; este endpoint permite forzarlo.
  @Post('no-shows/procesar')
  @HttpCode(200)
  @RequierePermiso(PERMISOS.NO_SHOWS_PROCESAR)
  procesarNoShows() {
    return this.reservasService.procesarNoShows();
  }

  @Post(':id/check-in')
  @RequierePermiso(PERMISOS.ESTADIAS_GESTIONAR)
  checkIn(@Param('id') id: string) {
    return this.reservasService.checkIn(id);
  }

  @Post(':id/check-out')
  @RequierePermiso(PERMISOS.ESTADIAS_GESTIONAR)
  checkOut(@Param('id') id: string) {
    return this.reservasService.checkOut(id);
  }

  @Post(':id/cancelar')
  @RequierePermiso(PERMISOS.RESERVAS_GESTIONAR)
  cancelar(@Param('id') id: string) {
    return this.reservasService.cancelar(id);
  }
}
