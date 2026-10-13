import { ApiTags } from '@nestjs/swagger';
import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ReservasService } from './reservas.service';
import { CrearReservaDto } from './dto/crear-reserva.dto';
import { ListarReservasDto } from './dto/listar-reservas.dto';
import { CheckOutDto } from '../folio/folio.dto';
import { RequierePermiso, UsuarioActual, UsuarioAutenticado } from '../auth/decoradores';
import { PERMISOS } from '../auth/permisos';

// Cada acción recibe al usuario que la hace para dejarla en la auditoría (R34).
@ApiTags('Reservas')
@Controller('reservas')
export class ReservasController {
  constructor(private readonly reservasService: ReservasService) {}

  @Get()
  @RequierePermiso(PERMISOS.RESERVAS_VER)
  listar(@Query() filtros: ListarReservasDto) {
    return this.reservasService.listar(filtros);
  }

  @Post()
  @RequierePermiso(PERMISOS.RESERVAS_GESTIONAR)
  crear(@Body() dto: CrearReservaDto, @UsuarioActual() quien: UsuarioAutenticado) {
    return this.reservasService.crear(dto, quien);
  }

  // Normalmente lo ejecuta una tarea programada; este endpoint permite forzarlo.
  @Post('no-shows/procesar')
  @HttpCode(200)
  @RequierePermiso(PERMISOS.NO_SHOWS_PROCESAR)
  procesarNoShows() {
    return this.reservasService.procesarNoShows();
  }

  @Get(':id/historial')
  @RequierePermiso(PERMISOS.RESERVAS_VER)
  historial(@Param('id') id: string) {
    return this.reservasService.historial(id);
  }

  @Post(':id/check-in')
  @RequierePermiso(PERMISOS.ESTADIAS_GESTIONAR)
  checkIn(@Param('id') id: string, @UsuarioActual() quien: UsuarioAutenticado) {
    return this.reservasService.checkIn(id, quien);
  }

  @Post(':id/check-out')
  @RequierePermiso(PERMISOS.ESTADIAS_GESTIONAR)
  checkOut(
    @Param('id') id: string,
    @Body() dto: CheckOutDto,
    @UsuarioActual() quien: UsuarioAutenticado,
  ) {
    return this.reservasService.checkOut(id, dto.medioPago, quien);
  }

  @Post(':id/cancelar')
  @RequierePermiso(PERMISOS.RESERVAS_GESTIONAR)
  cancelar(@Param('id') id: string, @UsuarioActual() quien: UsuarioAutenticado) {
    return this.reservasService.cancelar(id, quien);
  }
}
