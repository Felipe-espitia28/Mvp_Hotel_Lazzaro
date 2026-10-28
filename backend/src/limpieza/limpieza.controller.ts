import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  ContextoHotel,
  HotelActual,
  RequierePermiso,
  UsuarioActual,
  UsuarioAutenticado,
} from '../auth/decoradores';
import { PERMISOS } from '../auth/permisos';
import {
  AsignarTareasDto,
  AvanzarTareaDto,
  CrearTareaDto,
  ListarIncidenciasDto,
  ListarTareasDto,
  ReportarIncidenciaDto,
  ResolverIncidenciaDto,
} from './limpieza.dto';
import { IncidenciasService } from './incidencias.service';
import { LimpiezaService } from './limpieza.service';

// B-4: tareas de limpieza del día.
@ApiTags('Limpieza')
@Controller('limpieza/tareas')
@RequierePermiso(PERMISOS.LIMPIEZA_GESTIONAR)
export class LimpiezaController {
  constructor(private readonly limpieza: LimpiezaService) {}

  @Get()
  tareas(
    @HotelActual() hotel: ContextoHotel,
    @Query() filtro: ListarTareasDto,
    @UsuarioActual() quien: UsuarioAutenticado,
  ) {
    return this.limpieza.tareas(hotel.id, filtro, quien);
  }

  // A quién se le puede asignar: el personal activo del hotel.
  @Get('personal')
  @RequierePermiso(PERMISOS.LIMPIEZA_ASIGNAR)
  personal(@HotelActual() hotel: ContextoHotel) {
    return this.limpieza.personal(hotel.id);
  }

  @Post()
  @RequierePermiso(PERMISOS.LIMPIEZA_ASIGNAR)
  crear(@HotelActual() hotel: ContextoHotel, @Body() dto: CrearTareaDto) {
    return this.limpieza.crear(hotel.id, dto);
  }

  @Post('asignar')
  @RequierePermiso(PERMISOS.LIMPIEZA_ASIGNAR)
  asignar(@HotelActual() hotel: ContextoHotel, @Body() dto: AsignarTareasDto) {
    return this.limpieza.asignar(hotel.id, dto.tareaIds, dto.usuarioId);
  }

  @Patch(':id')
  avanzar(
    @HotelActual() hotel: ContextoHotel,
    @Param('id') id: string,
    @Body() dto: AvanzarTareaDto,
    @UsuarioActual() quien: UsuarioAutenticado,
  ) {
    return this.limpieza.avanzar(hotel.id, id, dto.accion, dto.observaciones, quien);
  }
}

// B-4: daños reportados en las habitaciones.
@ApiTags('Limpieza')
@Controller('incidencias')
export class IncidenciasController {
  constructor(private readonly incidencias: IncidenciasService) {}

  @Get()
  @RequierePermiso(PERMISOS.LIMPIEZA_GESTIONAR)
  listar(@HotelActual() hotel: ContextoHotel, @Query() filtro: ListarIncidenciasDto) {
    return this.incidencias.listar(hotel.id, filtro.estado);
  }

  @Post()
  @RequierePermiso(PERMISOS.LIMPIEZA_GESTIONAR)
  reportar(
    @HotelActual() hotel: ContextoHotel,
    @Body() dto: ReportarIncidenciaDto,
    @UsuarioActual() quien: UsuarioAutenticado,
  ) {
    return this.incidencias.reportar(hotel.id, dto, quien);
  }

  // Resolver no devuelve la habitación a libre: quien maneja los estados decide.
  @Patch(':id')
  @RequierePermiso(PERMISOS.HABITACIONES_ESTADO)
  resolver(
    @HotelActual() hotel: ContextoHotel,
    @Param('id') id: string,
    @Body() dto: ResolverIncidenciaDto,
    @UsuarioActual() quien: UsuarioAutenticado,
  ) {
    return this.incidencias.resolver(hotel.id, id, dto.solucion, quien);
  }
}
