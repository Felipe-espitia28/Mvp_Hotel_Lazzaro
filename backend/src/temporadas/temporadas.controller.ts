import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ContextoHotel, HotelActual, RequierePermiso } from '../auth/decoradores';
import { PERMISOS } from '../auth/permisos';
import { ActualizarTemporadaDto, CrearTemporadaDto } from './temporadas.dto';
import { TemporadasService } from './temporadas.service';

// Rangos de temporada del hotel: los consulta quien ve habitaciones; solo su
// administrador los cambia (Gerencia).
@ApiTags('Gerencia del hotel')
@Controller('temporadas')
export class TemporadasController {
  constructor(private readonly temporadasService: TemporadasService) {}

  @Get()
  @RequierePermiso(PERMISOS.HABITACIONES_VER)
  listar(@HotelActual() hotel: ContextoHotel) {
    return this.temporadasService.listar(hotel.id);
  }

  @Post()
  @RequierePermiso(PERMISOS.HOTEL_CONFIGURAR)
  crear(@HotelActual() hotel: ContextoHotel, @Body() dto: CrearTemporadaDto) {
    return this.temporadasService.crear(hotel.id, dto);
  }

  @Patch(':id')
  @RequierePermiso(PERMISOS.HOTEL_CONFIGURAR)
  actualizar(
    @HotelActual() hotel: ContextoHotel,
    @Param('id') id: string,
    @Body() dto: ActualizarTemporadaDto,
  ) {
    return this.temporadasService.actualizar(hotel.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequierePermiso(PERMISOS.HOTEL_CONFIGURAR)
  async eliminar(@HotelActual() hotel: ContextoHotel, @Param('id') id: string) {
    await this.temporadasService.eliminar(hotel.id, id);
  }
}
