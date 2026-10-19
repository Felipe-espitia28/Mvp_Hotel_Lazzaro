import { ApiTags } from '@nestjs/swagger';
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { HabitacionesService } from './habitaciones.service';
import { CrearHabitacionDto } from './dto/crear-habitacion.dto';
import { CambiarEstadoDto } from './dto/cambiar-estado.dto';
import { ConsultarDisponibilidadDto } from './dto/consultar-disponibilidad.dto';
import { ContextoHotel, HotelActual, RequierePermiso } from '../auth/decoradores';
import { PERMISOS } from '../auth/permisos';

@ApiTags('Habitaciones')
@Controller('habitaciones')
export class HabitacionesController {
  constructor(private readonly habitacionesService: HabitacionesService) {}

  @Get()
  @RequierePermiso(PERMISOS.HABITACIONES_VER)
  listar(@HotelActual() hotel: ContextoHotel) {
    return this.habitacionesService.listar(hotel.id);
  }

  // IMPORTANTE: esta ruta debe declararse antes de cualquier ruta con parámetro
  // dinámico (":id") para que Nest no intente interpretar "disponibles" como un id.
  @Get('disponibles')
  @RequierePermiso(PERMISOS.HABITACIONES_VER)
  disponibles(@HotelActual() hotel: ContextoHotel, @Query() query: ConsultarDisponibilidadDto) {
    return this.habitacionesService.disponibles(hotel, query.desde, query.hasta, query.huespedes);
  }

  @Post()
  @RequierePermiso(PERMISOS.HABITACIONES_GESTIONAR)
  crear(@HotelActual() hotel: ContextoHotel, @Body() dto: CrearHabitacionDto) {
    return this.habitacionesService.crear(hotel.id, dto);
  }

  // Marcar lista tras la limpieza, o sacar / volver a servicio (R25, R26).
  @Patch(':id/estado')
  @RequierePermiso(PERMISOS.HABITACIONES_ESTADO)
  cambiarEstado(
    @HotelActual() hotel: ContextoHotel,
    @Param('id') id: string,
    @Body() dto: CambiarEstadoDto,
  ) {
    return this.habitacionesService.cambiarEstado(hotel.id, id, dto.estado);
  }
}
