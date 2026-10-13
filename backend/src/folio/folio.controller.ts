import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequierePermiso, UsuarioActual, UsuarioAutenticado } from '../auth/decoradores';
import { PERMISOS } from '../auth/permisos';
import { AgregarCargoDto, AnularCargoDto } from './folio.dto';
import { FolioService } from './folio.service';

@ApiTags('Folio')
@Controller('reservas/:id')
export class FolioController {
  constructor(private readonly folioService: FolioService) {}

  @Get('folio')
  @RequierePermiso(PERMISOS.RESERVAS_VER)
  folio(@Param('id') id: string) {
    return this.folioService.folio(id);
  }

  @Post('cargos')
  @RequierePermiso(PERMISOS.FOLIO_GESTIONAR)
  agregarCargo(
    @Param('id') id: string,
    @Body() dto: AgregarCargoDto,
    @UsuarioActual() quien: UsuarioAutenticado,
  ) {
    return this.folioService.agregarCargo(id, dto, quien);
  }

  @Post('cargos/:cargoId/anular')
  @RequierePermiso(PERMISOS.FOLIO_GESTIONAR)
  anularCargo(
    @Param('id') id: string,
    @Param('cargoId') cargoId: string,
    @Body() dto: AnularCargoDto,
    @UsuarioActual() quien: UsuarioAutenticado,
  ) {
    return this.folioService.anularCargo(id, cargoId, dto.motivo, quien);
  }
}
