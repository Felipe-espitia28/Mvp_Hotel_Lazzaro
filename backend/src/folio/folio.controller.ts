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
import { AgregarCargoDto, AnularCargoDto, AnularPagoDto, RegistrarPagoDto } from './folio.dto';
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
    return this.folioService.agregarCargo(hotel, id, dto, quien);
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

  // A-1: abonos y reembolsos; recepción y admin.
  @Post('pagos')
  @RequierePermiso(PERMISOS.FOLIO_GESTIONAR)
  registrarPago(
    @HotelActual() hotel: ContextoHotel,
    @Param('id') id: string,
    @Body() dto: RegistrarPagoDto,
    @UsuarioActual() quien: UsuarioAutenticado,
  ) {
    return this.folioService.registrarPago(hotel, id, dto, quien);
  }

  // A-1: anular un pago es una corrección contable: solo el admin.
  @Post('pagos/:pagoId/anular')
  @RequierePermiso(PERMISOS.PAGOS_ANULAR)
  anularPago(
    @HotelActual() hotel: ContextoHotel,
    @Param('id') id: string,
    @Param('pagoId') pagoId: string,
    @Body() dto: AnularPagoDto,
    @UsuarioActual() quien: UsuarioAutenticado,
  ) {
    return this.folioService.anularPago(hotel.id, id, pagoId, dto.motivo, quien);
  }
}

// A-1: lo que los huéspedes aún deben al hotel.
@ApiTags('Folio')
@Controller('cuentas-por-cobrar')
export class CuentasPorCobrarController {
  constructor(private readonly folioService: FolioService) {}

  @Get()
  @RequierePermiso(PERMISOS.CUENTAS_POR_COBRAR)
  listar(@HotelActual() hotel: ContextoHotel) {
    return this.folioService.cuentasPorCobrar(hotel.id);
  }
}

// A-2: lo que el hotel debe devolver a los huéspedes.
@ApiTags('Folio')
@Controller('saldos-a-favor')
export class SaldosAFavorController {
  constructor(private readonly folioService: FolioService) {}

  @Get()
  @RequierePermiso(PERMISOS.CUENTAS_POR_COBRAR)
  listar(@HotelActual() hotel: ContextoHotel) {
    return this.folioService.saldosAFavor(hotel.id);
  }
}
