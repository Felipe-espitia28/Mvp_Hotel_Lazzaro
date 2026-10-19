import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ContextoHotel, HotelActual, RequierePermiso } from '../auth/decoradores';
import { PERMISOS } from '../auth/permisos';
import { DatosHotelDto } from './hotel.dto';
import { PoliticasDto } from './politicas.dto';
import { HotelService } from './hotel.service';

// El hotel del usuario. Todo su personal lo consulta (la app toma de aquí la
// marca y las reglas); solo su administrador lo edita, desde la Gerencia.
@ApiTags('Gerencia del hotel')
@Controller('hotel')
export class HotelController {
  constructor(private readonly hotelService: HotelService) {}

  @Get()
  obtener(@HotelActual() hotel: ContextoHotel) {
    return this.hotelService.obtener(hotel.id);
  }

  @Patch()
  @RequierePermiso(PERMISOS.HOTEL_CONFIGURAR)
  actualizarDatos(@HotelActual() hotel: ContextoHotel, @Body() dto: DatosHotelDto) {
    return this.hotelService.actualizarDatos(hotel.id, dto);
  }

  // Horarios, cancelación, penalidad, estadía, IVA, multiplicadores, medios de pago.
  @Patch('politicas')
  @RequierePermiso(PERMISOS.HOTEL_CONFIGURAR)
  actualizarPoliticas(@HotelActual() hotel: ContextoHotel, @Body() dto: PoliticasDto) {
    return this.hotelService.actualizarPoliticas(hotel.id, dto);
  }
}
