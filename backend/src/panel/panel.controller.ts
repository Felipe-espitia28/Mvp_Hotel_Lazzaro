import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ContextoHotel, HotelActual, RequierePermiso } from '../auth/decoradores';
import { PERMISOS } from '../auth/permisos';
import {
  ConsultarCalendarioDto,
  ConsultarGerenciaDto,
  ConsultarPickupDto,
  ConsultarPronosticoDto,
} from './panel.dto';
import { PanelService } from './panel.service';

@ApiTags('Panel')
@Controller('panel')
@RequierePermiso(PERMISOS.RESERVAS_VER)
export class PanelController {
  constructor(private readonly panelService: PanelService) {}

  // Resumen del día: ocupación, llegadas, salidas, anticipos e ingresos del mes.
  @Get('hoy')
  hoy(@HotelActual() hotel: ContextoHotel) {
    return this.panelService.hoy(hotel);
  }

  @Get('calendario')
  calendario(@HotelActual() hotel: ContextoHotel, @Query() query: ConsultarCalendarioDto) {
    return this.panelService.calendario(hotel.id, query.desde, query.dias);
  }

  // B-1: indicadores del negocio (ocupación, ADR, RevPAR, ingresos), solo admin.
  @Get('gerencia')
  @RequierePermiso(PERMISOS.PANEL_GERENCIA)
  gerencia(@HotelActual() hotel: ContextoHotel, @Query() query: ConsultarGerenciaDto) {
    return this.panelService.gerencia(hotel, query.desde, query.hasta);
  }

  @Get('pronostico')
  @RequierePermiso(PERMISOS.PANEL_GERENCIA)
  pronostico(@HotelActual() hotel: ContextoHotel, @Query() query: ConsultarPronosticoDto) {
    return this.panelService.pronostico(hotel.id, query.dias);
  }

  @Get('pickup')
  @RequierePermiso(PERMISOS.PANEL_GERENCIA)
  pickup(@HotelActual() hotel: ContextoHotel, @Query() query: ConsultarPickupDto) {
    return this.panelService.pickup(hotel.id, query.dias);
  }
}
