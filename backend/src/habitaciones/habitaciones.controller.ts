import { ApiTags } from '@nestjs/swagger';
import { Body, Controller, Get, Header, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HabitacionesService } from './habitaciones.service';
import { LoteHabitacionesService } from './lote-habitaciones.service';
import { CrearHabitacionDto } from './dto/crear-habitacion.dto';
import { CambiarEstadoDto } from './dto/cambiar-estado.dto';
import { ConsultarDisponibilidadDto } from './dto/consultar-disponibilidad.dto';
import {
  ConsultaImportarDto,
  CrearRangoDto,
  ImportarHabitacionesDto,
  LoteEstadoDto,
  LoteTipoDto,
} from './dto/lote.dto';
import { ContextoHotel, HotelActual, RequierePermiso } from '../auth/decoradores';
import { PERMISOS } from '../auth/permisos';

@ApiTags('Habitaciones')
@Controller('habitaciones')
export class HabitacionesController {
  constructor(
    private readonly habitacionesService: HabitacionesService,
    private readonly lote: LoteHabitacionesService,
  ) {}

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
    return this.habitacionesService.disponibles(hotel, query.desde, query.hasta, {
      adultos: query.adultos ?? 1,
      edadesNinos: query.edadesNinos ?? [],
    });
  }

  // A-4: un CSV con los encabezados y dos filas de ejemplo para importar.
  @Get('plantilla')
  @RequierePermiso(PERMISOS.HABITACIONES_GESTIONAR)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="plantilla-habitaciones.csv"')
  plantilla(@HotelActual() hotel: ContextoHotel) {
    return this.lote.plantilla(hotel.id);
  }

  // A-4 / R52: todo o nada; los números que ya existen se informan y no se crea ninguna.
  @Post('rango')
  @RequierePermiso(PERMISOS.HABITACIONES_GESTIONAR)
  crearRango(@HotelActual() hotel: ContextoHotel, @Body() dto: CrearRangoDto) {
    return this.lote.crearRango(hotel.id, dto);
  }

  // Con soloValidar devuelve el informe (200) sin guardar; si no, guarda todo
  // o nada (400 con el informe si alguna fila tiene errores).
  @Post('importar')
  @RequierePermiso(PERMISOS.HABITACIONES_GESTIONAR)
  importar(
    @HotelActual() hotel: ContextoHotel,
    @Body() dto: ImportarHabitacionesDto,
    @Query() q: ConsultaImportarDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (q.soloValidar) res.status(200);
    return this.lote.importar(hotel.id, dto.filas, q.soloValidar ?? false);
  }

  @Post('lote/estado')
  @RequierePermiso(PERMISOS.HABITACIONES_ESTADO)
  cambiarEstadoEnLote(@HotelActual() hotel: ContextoHotel, @Body() dto: LoteEstadoDto) {
    return this.lote.cambiarEstado(hotel.id, dto.ids, dto.estado);
  }

  @Post('lote/tipo')
  @RequierePermiso(PERMISOS.HABITACIONES_GESTIONAR)
  cambiarTipoEnLote(@HotelActual() hotel: ContextoHotel, @Body() dto: LoteTipoDto) {
    return this.lote.cambiarTipo(hotel.id, dto.ids, dto.tipoId);
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
