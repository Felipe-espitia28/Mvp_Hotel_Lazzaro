import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequierePermiso } from '../auth/decoradores';
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
  listarTipos() {
    return this.tarifasService.listarTipos();
  }

  @Post('tipos-habitacion')
  @RequierePermiso(PERMISOS.HABITACIONES_GESTIONAR)
  crearTipo(@Body() dto: CrearTipoHabitacionDto) {
    return this.tarifasService.crearTipo(dto);
  }

  @Patch('tipos-habitacion/:id')
  @RequierePermiso(PERMISOS.HABITACIONES_GESTIONAR)
  actualizarTipo(@Param('id') id: string, @Body() dto: ActualizarTipoHabitacionDto) {
    return this.tarifasService.actualizarTipo(id, dto);
  }

  @Get('tarifas/temporadas')
  @RequierePermiso(PERMISOS.HABITACIONES_VER)
  temporadas(@Query() query: ConsultarTemporadasDto) {
    return this.tarifasService.temporadas(query.anio);
  }
}
