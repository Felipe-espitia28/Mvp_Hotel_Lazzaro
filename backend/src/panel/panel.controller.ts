import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ContextoHotel, HotelActual, RequierePermiso } from '../auth/decoradores';
import { PERMISOS } from '../auth/permisos';
import { ConsultarCalendarioDto } from './panel.dto';
import { PanelService } from './panel.service';

@ApiTags('Panel')
@Controller('panel')
@RequierePermiso(PERMISOS.RESERVAS_VER)
export class PanelController {
  constructor(private readonly panelService: PanelService) {}

  // Resumen del día: ocupación, llegadas, salidas e ingresos del mes.
  @Get('hoy')
  hoy(@HotelActual() hotel: ContextoHotel) {
    return this.panelService.hoy(hotel);
  }

  @Get('calendario')
  calendario(@HotelActual() hotel: ContextoHotel, @Query() query: ConsultarCalendarioDto) {
    return this.panelService.calendario(hotel.id, query.desde, query.dias);
  }
}
