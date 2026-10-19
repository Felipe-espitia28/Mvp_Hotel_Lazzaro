import { ApiTags } from '@nestjs/swagger';
import { Controller, Get, Param, ParseEnumPipe, Query } from '@nestjs/common';
import { TipoDocumento } from '@prisma/client';
import { ContextoHotel, HotelActual, RequierePermiso } from '../auth/decoradores';
import { PERMISOS } from '../auth/permisos';
import { BuscarHuespedesDto } from './huespedes.dto';
import { HuespedesService } from './huespedes.service';

// Consulta de huéspedes: la ve quien puede ver reservas (recepción y admin).
@ApiTags('Huéspedes')
@Controller('huespedes')
@RequierePermiso(PERMISOS.RESERVAS_VER)
export class HuespedesController {
  constructor(private readonly huespedesService: HuespedesService) {}

  @Get()
  buscar(@HotelActual() hotel: ContextoHotel, @Query() query: BuscarHuespedesDto) {
    return this.huespedesService.buscar(hotel.id, query.buscar);
  }

  // Lo usa el formulario de reserva para reconocer a un cliente que vuelve.
  @Get('documento/:tipo/:documento')
  porDocumento(
    @HotelActual() hotel: ContextoHotel,
    @Param('tipo', new ParseEnumPipe(TipoDocumento)) tipo: TipoDocumento,
    @Param('documento') documento: string,
  ) {
    return this.huespedesService.porDocumento(hotel.id, tipo, documento);
  }

  @Get(':id')
  detalle(@HotelActual() hotel: ContextoHotel, @Param('id') id: string) {
    return this.huespedesService.detalle(hotel.id, id);
  }
}
