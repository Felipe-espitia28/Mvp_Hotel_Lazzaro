import { ApiTags } from '@nestjs/swagger';
import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ReservasService } from './reservas.service';
import { CrearReservaDto } from './dto/crear-reserva.dto';
import { ListarReservasDto } from './dto/listar-reservas.dto';
import { ConsultarRegistroDto, RegistroCheckInDto } from './dto/registro-check-in.dto';
import { CheckOutDto } from '../folio/folio.dto';
import {
  ContextoHotel,
  HotelActual,
  RequierePermiso,
  UsuarioActual,
  UsuarioAutenticado,
} from '../auth/decoradores';
import { PERMISOS } from '../auth/permisos';

// Cada acción recibe al usuario que la hace para dejarla en la auditoría (R34).
@ApiTags('Reservas')
@Controller('reservas')
export class ReservasController {
  constructor(private readonly reservasService: ReservasService) {}

  @Get()
  @RequierePermiso(PERMISOS.RESERVAS_VER)
  listar(@HotelActual() hotel: ContextoHotel, @Query() filtros: ListarReservasDto) {
    return this.reservasService.listar(hotel, filtros);
  }

  @Post()
  @RequierePermiso(PERMISOS.RESERVAS_GESTIONAR)
  crear(
    @HotelActual() hotel: ContextoHotel,
    @Body() dto: CrearReservaDto,
    @UsuarioActual() quien: UsuarioAutenticado,
  ) {
    return this.reservasService.crear(hotel, dto, quien);
  }

  // Normalmente lo ejecuta una tarea programada; este endpoint permite forzarlo.
  @Post('no-shows/procesar')
  @HttpCode(200)
  @RequierePermiso(PERMISOS.NO_SHOWS_PROCESAR)
  procesarNoShows(@HotelActual() hotel: ContextoHotel) {
    return this.reservasService.procesarNoShows(hotel);
  }

  // R19: datos del registro hotelero de un día de llegada (por defecto, hoy).
  @Get('registro-hotelero')
  @RequierePermiso(PERMISOS.RESERVAS_VER)
  registroHotelero(@HotelActual() hotel: ContextoHotel, @Query() query: ConsultarRegistroDto) {
    return this.reservasService.registroHotelero(hotel.id, query.fecha);
  }

  @Get(':id/historial')
  @RequierePermiso(PERMISOS.RESERVAS_VER)
  historial(@HotelActual() hotel: ContextoHotel, @Param('id') id: string) {
    return this.reservasService.historial(hotel.id, id);
  }

  @Get(':id/ocupantes')
  @RequierePermiso(PERMISOS.RESERVAS_VER)
  ocupantes(@HotelActual() hotel: ContextoHotel, @Param('id') id: string) {
    return this.reservasService.ocupantes(hotel.id, id);
  }

  @Post(':id/check-in')
  @RequierePermiso(PERMISOS.ESTADIAS_GESTIONAR)
  checkIn(
    @HotelActual() hotel: ContextoHotel,
    @Param('id') id: string,
    @Body() registro: RegistroCheckInDto,
    @UsuarioActual() quien: UsuarioAutenticado,
  ) {
    return this.reservasService.checkIn(hotel, id, registro, quien);
  }

  @Post(':id/check-out')
  @RequierePermiso(PERMISOS.ESTADIAS_GESTIONAR)
  checkOut(
    @HotelActual() hotel: ContextoHotel,
    @Param('id') id: string,
    @Body() dto: CheckOutDto,
    @UsuarioActual() quien: UsuarioAutenticado,
  ) {
    return this.reservasService.checkOut(hotel, id, dto, quien);
  }

  @Post(':id/cancelar')
  @RequierePermiso(PERMISOS.RESERVAS_GESTIONAR)
  cancelar(
    @HotelActual() hotel: ContextoHotel,
    @Param('id') id: string,
    @UsuarioActual() quien: UsuarioAutenticado,
  ) {
    return this.reservasService.cancelar(hotel, id, quien);
  }
}
