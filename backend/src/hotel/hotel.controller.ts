import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ContextoHotel, HotelActual, Publico, RequierePermiso } from '../auth/decoradores';
import { PERMISOS } from '../auth/permisos';
import { DatosHotelDto, NuevaPoliticaDatosDto } from './hotel.dto';
import { PoliticasDto } from './politicas.dto';
import { ActualizarMarcaDto } from './marca';
import { HotelService } from './hotel.service';
import { PoliticaDatosService } from './politica-datos';

// El hotel del usuario. Todo su personal lo consulta (la app toma de aquí la
// marca y las reglas); solo su administrador lo edita, desde la Gerencia.
@ApiTags('Gerencia del hotel')
@Controller()
export class HotelController {
  constructor(
    private readonly hotelService: HotelService,
    private readonly politicaDatos: PoliticaDatosService,
  ) {}

  @Get('hotel')
  obtener(@HotelActual() hotel: ContextoHotel) {
    return this.hotelService.obtener(hotel.id);
  }

  @Patch('hotel')
  @RequierePermiso(PERMISOS.HOTEL_CONFIGURAR)
  actualizarDatos(@HotelActual() hotel: ContextoHotel, @Body() dto: DatosHotelDto) {
    return this.hotelService.actualizarDatos(hotel.id, dto);
  }

  // Logo, colores, tipografías y eslogan.
  @Patch('hotel/marca')
  @RequierePermiso(PERMISOS.HOTEL_CONFIGURAR)
  actualizarMarca(@HotelActual() hotel: ContextoHotel, @Body() dto: ActualizarMarcaDto) {
    return this.hotelService.actualizarMarca(hotel.id, dto);
  }

  // Horarios, cancelación, penalidad, estadía, IVA, multiplicadores, medios de pago.
  @Patch('hotel/politicas')
  @RequierePermiso(PERMISOS.HOTEL_CONFIGURAR)
  actualizarPoliticas(@HotelActual() hotel: ContextoHotel, @Body() dto: PoliticasDto) {
    return this.hotelService.actualizarPoliticas(hotel.id, dto);
  }

  // R45: política de tratamiento de datos vigente (la que acepta el huésped en el check-in).
  @Get('hotel/politica-datos')
  politicaDatosVigente(@HotelActual() hotel: ContextoHotel) {
    return this.politicaDatos.vigente(hotel.id);
  }

  // Cambiarla crea una versión nueva; desde ahí los huéspedes la aceptan de nuevo.
  @Post('hotel/politica-datos')
  @RequierePermiso(PERMISOS.HOTEL_CONFIGURAR)
  nuevaPoliticaDatos(@HotelActual() hotel: ContextoHotel, @Body() dto: NuevaPoliticaDatosDto) {
    return this.politicaDatos.nuevaVersion(hotel.id, dto.texto);
  }

  // Público: la marca de un hotel para su pantalla de ingreso (?hotel=slug).
  @Publico()
  @Get('publico/hoteles/:slug/marca')
  marcaPublica(@Param('slug') slug: string) {
    return this.hotelService.marcaPublica(slug);
  }
}
