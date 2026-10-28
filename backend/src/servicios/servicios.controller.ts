import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
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
  OrdenCategoriasDto,
} from './dto/servicios.dto';
import { ServiciosService } from './servicios.service';

// Catálogo de servicios (S-1): lo usa quien carga consumos al folio
// (recepción); solo el administrador lo edita (Gerencia). Las rutas fijas van
// antes de ":id".
@ApiTags('Gerencia del hotel')
@Controller('servicios')
export class ServiciosController {
  constructor(private readonly serviciosService: ServiciosService) {}

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
