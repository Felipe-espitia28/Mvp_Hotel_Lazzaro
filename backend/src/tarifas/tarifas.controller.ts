import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ContextoHotel, HotelActual, RequierePermiso } from '../auth/decoradores';
import { PERMISOS } from '../auth/permisos';
import {
  ActualizarTipoHabitacionDto,
  ConsultarTemporadasDto,
  CrearTipoHabitacionDto,
} from './tarifas.dto';
import { TarifasService } from './tarifas.service';

// Tarifas: todos los que ven habitaciones las consultan; solo el admin las cambia.
@ApiTags('Tarifas')
@Controller()
export class TarifasController {
  constructor(private readonly tarifasService: TarifasService) {}

  @Get('tipos-habitacion')
  @RequierePermiso(PERMISOS.HABITACIONES_VER)
  listarTipos(@HotelActual() hotel: ContextoHotel) {
    return this.tarifasService.listarTipos(hotel.id);
  }

  @Post('tipos-habitacion')
  @RequierePermiso(PERMISOS.HABITACIONES_GESTIONAR)
  crearTipo(@HotelActual() hotel: ContextoHotel, @Body() dto: CrearTipoHabitacionDto) {
    return this.tarifasService.crearTipo(hotel.id, dto);
  }

  @Patch('tipos-habitacion/:id')
  @RequierePermiso(PERMISOS.HABITACIONES_GESTIONAR)
  actualizarTipo(
    @HotelActual() hotel: ContextoHotel,
    @Param('id') id: string,
    @Body() dto: ActualizarTipoHabitacionDto,
  ) {
    return this.tarifasService.actualizarTipo(hotel.id, id, dto);
  }

  @Get('tarifas/temporadas')
  @RequierePermiso(PERMISOS.HABITACIONES_VER)
  temporadas(@HotelActual() hotel: ContextoHotel, @Query() query: ConsultarTemporadasDto) {
    return this.tarifasService.temporadas(hotel, query.anio);
  }
}
