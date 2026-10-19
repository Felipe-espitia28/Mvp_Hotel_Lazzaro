import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ContextoHotel, HotelActual, RequierePermiso } from '../auth/decoradores';
import { PERMISOS } from '../auth/permisos';
import { ActualizarProductoDto, CrearProductoDto } from './productos.dto';
import { ProductosService } from './productos.service';

// Catálogo de consumos: lo usa quien carga consumos al folio (recepción);
// solo el administrador lo edita (Gerencia).
@ApiTags('Gerencia del hotel')
@Controller('productos')
export class ProductosController {
  constructor(private readonly productosService: ProductosService) {}

  @Get()
  @RequierePermiso(PERMISOS.FOLIO_GESTIONAR)
  listar(@HotelActual() hotel: ContextoHotel) {
    return this.productosService.listar(hotel.id);
  }

  @Post()
  @RequierePermiso(PERMISOS.HOTEL_CONFIGURAR)
  crear(@HotelActual() hotel: ContextoHotel, @Body() dto: CrearProductoDto) {
    return this.productosService.crear(hotel.id, dto);
  }

  @Patch(':id')
  @RequierePermiso(PERMISOS.HOTEL_CONFIGURAR)
  actualizar(
    @HotelActual() hotel: ContextoHotel,
    @Param('id') id: string,
    @Body() dto: ActualizarProductoDto,
  ) {
    return this.productosService.actualizar(hotel.id, id, dto);
  }
}
