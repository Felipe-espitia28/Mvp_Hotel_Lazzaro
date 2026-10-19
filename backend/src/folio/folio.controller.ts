import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  ContextoHotel,
  HotelActual,
  RequierePermiso,
  UsuarioActual,
  UsuarioAutenticado,
} from '../auth/decoradores';
import { PERMISOS } from '../auth/permisos';
import { AgregarCargoDto, AnularCargoDto } from './folio.dto';
import { FolioService } from './folio.service';

@ApiTags('Folio')
@Controller('reservas/:id')
export class FolioController {
  constructor(private readonly folioService: FolioService) {}

  @Get('folio')
  @RequierePermiso(PERMISOS.RESERVAS_VER)
  folio(@HotelActual() hotel: ContextoHotel, @Param('id') id: string) {
    return this.folioService.folio(hotel.id, id);
  }

  @Post('cargos')
  @RequierePermiso(PERMISOS.FOLIO_GESTIONAR)
  agregarCargo(
    @HotelActual() hotel: ContextoHotel,
    @Param('id') id: string,
    @Body() dto: AgregarCargoDto,
    @UsuarioActual() quien: UsuarioAutenticado,
  ) {
    return this.folioService.agregarCargo(hotel.id, id, dto, quien);
  }

  @Post('cargos/:cargoId/anular')
  @RequierePermiso(PERMISOS.FOLIO_GESTIONAR)
  anularCargo(
    @HotelActual() hotel: ContextoHotel,
    @Param('id') id: string,
    @Param('cargoId') cargoId: string,
    @Body() dto: AnularCargoDto,
    @UsuarioActual() quien: UsuarioAutenticado,
  ) {
    return this.folioService.anularCargo(hotel.id, id, cargoId, dto.motivo, quien);
  }
}
