import { ApiTags } from '@nestjs/swagger';
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { HabitacionesService } from './habitaciones.service';
import { CrearHabitacionDto } from './dto/crear-habitacion.dto';
import { ConsultarDisponibilidadDto } from './dto/consultar-disponibilidad.dto';
import { RequierePermiso } from '../auth/decoradores';
import { PERMISOS } from '../auth/permisos';

@ApiTags('Habitaciones')
@Controller('habitaciones')
export class HabitacionesController {
  constructor(private readonly habitacionesService: HabitacionesService) {}

  @Get()
  @RequierePermiso(PERMISOS.HABITACIONES_VER)
  listar() {
    return this.habitacionesService.listar();
  }

  // IMPORTANTE: esta ruta debe declararse antes de cualquier ruta con parámetro
  // dinámico (":id") para que Nest no intente interpretar "disponibles" como un id.
  @Get('disponibles')
  @RequierePermiso(PERMISOS.HABITACIONES_VER)
  disponibles(@Query() query: ConsultarDisponibilidadDto) {
    return this.habitacionesService.disponibles(query.desde, query.hasta);
  }

  @Post()
  @RequierePermiso(PERMISOS.HABITACIONES_GESTIONAR)
  crear(@Body() dto: CrearHabitacionDto) {
    return this.habitacionesService.crear(dto);
  }
}
