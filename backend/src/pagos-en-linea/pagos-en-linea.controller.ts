import { Body, Controller, Get, HttpCode, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  ContextoHotel,
  HotelActual,
  Publico,
  RequierePermiso,
  UsuarioActual,
  UsuarioAutenticado,
} from '../auth/decoradores';
import { PERMISOS } from '../auth/permisos';
import { CrearLinkDePagoDto, DecisionSimuladaDto, LlavesWompiDto } from './pagos-en-linea.dto';
import { PagosEnLineaService } from './pagos-en-linea.service';

// B-2: links de pago de una reserva.
@ApiTags('Pagos en línea')
@Controller('reservas/:id')
export class LinksDePagoController {
  constructor(private readonly pagos: PagosEnLineaService) {}

  @Post('link-de-pago')
  @RequierePermiso(PERMISOS.FOLIO_GESTIONAR)
  crear(
    @HotelActual() hotel: ContextoHotel,
    @Param('id') id: string,
    @Body() dto: CrearLinkDePagoDto,
    @UsuarioActual() quien: UsuarioAutenticado,
  ) {
    return this.pagos.crearLink(hotel, id, dto.monto, quien);
  }

  @Get('intentos-de-pago')
  @RequierePermiso(PERMISOS.RESERVAS_VER)
  intentos(@HotelActual() hotel: ContextoHotel, @Param('id') id: string) {
    return this.pagos.intentosDe(hotel.id, id);
  }
}

// B-2: la pasarela del hotel: estado y llaves de Wompi.
@ApiTags('Pagos en línea')
@Controller('pagos-en-linea')
export class PagosEnLineaController {
  constructor(private readonly pagos: PagosEnLineaService) {}

  // Lo usa el frontend para mostrar u ocultar "Generar link de pago".
  @Get('estado')
  @RequierePermiso(PERMISOS.RESERVAS_VER)
  estado(@HotelActual() hotel: ContextoHotel) {
    return this.pagos.estado(hotel.id);
  }

  // Las llaves se guardan cifradas y nunca se devuelven.
  @Put('llaves')
  @RequierePermiso(PERMISOS.PAGOS_EN_LINEA_CONFIGURAR)
  guardarLlaves(@HotelActual() hotel: ContextoHotel, @Body() dto: LlavesWompiDto) {
    return this.pagos.guardarLlaves(hotel.id, dto);
  }

  @Post('probar')
  @HttpCode(200)
  @RequierePermiso(PERMISOS.PAGOS_EN_LINEA_CONFIGURAR)
  probar(@HotelActual() hotel: ContextoHotel) {
    return this.pagos.probarConexion(hotel.id);
  }
}

// B-2: lo que llega sin sesión: los eventos de la pasarela (verificados por
// su firma) y las páginas que ve el huésped.
@ApiTags('Pagos en línea')
@Controller()
@Publico()
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class PagosPublicosController {
  constructor(private readonly pagos: PagosEnLineaService) {}

  @Post('webhooks/wompi/:hotelSlug')
  @HttpCode(200)
  webhook(@Param('hotelSlug') slug: string, @Body() cuerpo: unknown) {
    return this.pagos.recibirWebhook(slug, cuerpo);
  }

  @Get('publico/pagos/:referencia/estado')
  estado(@Param('referencia') referencia: string) {
    return this.pagos.estadoPublico(referencia);
  }

  // Solo con PASARELA_PROVEEDOR=simulada (si no, 404).
  @Get('publico/pago-simulado/:referencia')
  pagoSimulado(@Param('referencia') referencia: string) {
    return this.pagos.pagoSimulado(referencia);
  }

  @Post('publico/pago-simulado/:referencia')
  @HttpCode(200)
  decidir(@Param('referencia') referencia: string, @Body() dto: DecisionSimuladaDto) {
    return this.pagos.decidirPagoSimulado(referencia, dto.aprobar);
  }
}
