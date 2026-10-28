import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import {
  ContextoHotel,
  HotelActual,
  RequierePermiso,
  UsuarioActual,
  UsuarioAutenticado,
} from '../auth/decoradores';
import { PERMISOS, tienePermiso } from '../auth/permisos';
import {
  ActualizarAtributoDto,
  ActualizarCategoriaDto,
  ActualizarServicioDto,
  AgregarFotoDto,
  ConsultaServiciosDto,
  CrearAtributoDto,
  CrearCategoriaDto,
  CrearServicioDto,
  ImportarServiciosDto,
  OrdenCategoriasDto,
} from './dto/servicios.dto';
import { ConsultaImportarDto } from '../habitaciones/dto/lote.dto';
import { ImportarServiciosService } from './importar-servicios.service';
import { ServiciosService } from './servicios.service';

// Catálogo de servicios (S-1): lo usa quien carga consumos al folio
// (recepción); solo el administrador lo edita (Gerencia). Las rutas fijas van
// antes de ":id".
@ApiTags('Gerencia del hotel')
@Controller('servicios')
export class ServiciosController {
  constructor(
    private readonly serviciosService: ServiciosService,
    private readonly importacion: ImportarServiciosService,
  ) {}

  @Get('categorias')
  @RequierePermiso(PERMISOS.FOLIO_GESTIONAR)
  listarCategorias(@HotelActual() hotel: ContextoHotel) {
    return this.serviciosService.listarCategorias(hotel.id);
  }

  @Post('categorias')
  @RequierePermiso(PERMISOS.HOTEL_CONFIGURAR)
  crearCategoria(@HotelActual() hotel: ContextoHotel, @Body() dto: CrearCategoriaDto) {
    return this.serviciosService.crearCategoria(hotel.id, dto);
  }

  @Patch('categorias/orden')
  @RequierePermiso(PERMISOS.HOTEL_CONFIGURAR)
  ordenarCategorias(@HotelActual() hotel: ContextoHotel, @Body() dto: OrdenCategoriasDto) {
    return this.serviciosService.ordenarCategorias(hotel.id, dto.ids);
  }

  @Patch('categorias/:id')
  @RequierePermiso(PERMISOS.HOTEL_CONFIGURAR)
  actualizarCategoria(
    @HotelActual() hotel: ContextoHotel,
    @Param('id') id: string,
    @Body() dto: ActualizarCategoriaDto,
  ) {
    return this.serviciosService.actualizarCategoria(hotel.id, id, dto);
  }

  // Plan 09: la plantilla de la categoría, con una columna por atributo propio.
  @Get('categorias/:id/plantilla')
  @RequierePermiso(PERMISOS.HOTEL_CONFIGURAR)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="plantilla-servicios.csv"')
  plantilla(@HotelActual() hotel: ContextoHotel, @Param('id') id: string) {
    return this.importacion.plantilla(hotel.id, id);
  }

  // R56: con soloValidar devuelve el informe (200) sin guardar; si no, guarda
  // todo o nada (400 con el informe si alguna fila tiene errores).
  @Post('categorias/:id/importar')
  @RequierePermiso(PERMISOS.HOTEL_CONFIGURAR)
  importar(
    @HotelActual() hotel: ContextoHotel,
    @Param('id') id: string,
    @Body() dto: ImportarServiciosDto,
    @Query() q: ConsultaImportarDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (q.soloValidar) res.status(200);
    return this.importacion.importar(hotel.id, id, dto.filas, q.soloValidar ?? false);
  }

  @Post('categorias/:id/atributos')
  @RequierePermiso(PERMISOS.HOTEL_CONFIGURAR)
  crearAtributo(
    @HotelActual() hotel: ContextoHotel,
    @Param('id') id: string,
    @Body() dto: CrearAtributoDto,
  ) {
    return this.serviciosService.crearAtributo(hotel.id, id, dto);
  }

  @Patch('categorias/:id/atributos/:atributoId')
  @RequierePermiso(PERMISOS.HOTEL_CONFIGURAR)
  actualizarAtributo(
    @HotelActual() hotel: ContextoHotel,
    @Param('id') id: string,
    @Param('atributoId') atributoId: string,
    @Body() dto: ActualizarAtributoDto,
  ) {
    return this.serviciosService.actualizarAtributo(hotel.id, id, atributoId, dto);
  }

  // Recepción ve solo lo que se ofrece; el administrador, todo el catálogo.
  @Get()
  @RequierePermiso(PERMISOS.FOLIO_GESTIONAR)
  listar(
    @HotelActual() hotel: ContextoHotel,
    @Query() consulta: ConsultaServiciosDto,
    @UsuarioActual() quien: UsuarioAutenticado,
  ) {
    return this.serviciosService.listar(
      hotel.id,
      consulta,
      tienePermiso(quien.rol, PERMISOS.HOTEL_CONFIGURAR),
    );
  }

  @Post()
  @RequierePermiso(PERMISOS.HOTEL_CONFIGURAR)
  crear(@HotelActual() hotel: ContextoHotel, @Body() dto: CrearServicioDto) {
    return this.serviciosService.crear(hotel.id, dto);
  }

  // El detalle trae las fotos (la lista no).
  @Get(':id')
  @RequierePermiso(PERMISOS.HOTEL_CONFIGURAR)
  detalle(@HotelActual() hotel: ContextoHotel, @Param('id') id: string) {
    return this.serviciosService.detalle(hotel.id, id);
  }

  @Patch(':id')
  @RequierePermiso(PERMISOS.HOTEL_CONFIGURAR)
  actualizar(
    @HotelActual() hotel: ContextoHotel,
    @Param('id') id: string,
    @Body() dto: ActualizarServicioDto,
  ) {
    return this.serviciosService.actualizar(hotel.id, id, dto);
  }

  @Post(':id/fotos')
  @RequierePermiso(PERMISOS.HOTEL_CONFIGURAR)
  agregarFoto(
    @HotelActual() hotel: ContextoHotel,
    @Param('id') id: string,
    @Body() dto: AgregarFotoDto,
  ) {
    return this.serviciosService.agregarFoto(hotel.id, id, dto.foto);
  }

  @Delete(':id/fotos/:indice')
  @RequierePermiso(PERMISOS.HOTEL_CONFIGURAR)
  quitarFoto(
    @HotelActual() hotel: ContextoHotel,
    @Param('id') id: string,
    @Param('indice', ParseIntPipe) indice: number,
  ) {
    return this.serviciosService.quitarFoto(hotel.id, id, indice);
  }
}
