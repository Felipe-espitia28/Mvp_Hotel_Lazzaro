import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  ContextoHotel,
  HotelActual,
  RequierePermiso,
  UsuarioActual,
  UsuarioAutenticado,
} from '../auth/decoradores';
import { PERMISOS } from '../auth/permisos';
import { AbrirTurnoDto, CerrarTurnoDto, ListarTurnosDto } from './turnos.dto';
import { TurnosService } from './turnos.service';

// B-3: turnos de caja y su cuadre.
@ApiTags('Caja')
@Controller('turnos')
@RequierePermiso(PERMISOS.CAJA_TURNO)
export class TurnosController {
  constructor(private readonly turnos: TurnosService) {}

  @Post('abrir')
  abrir(
    @HotelActual() hotel: ContextoHotel,
    @Body() dto: AbrirTurnoDto,
    @UsuarioActual() quien: UsuarioAutenticado,
  ) {
    return this.turnos.abrir(hotel, dto, quien);
  }

  // El turno abierto de quien pregunta (null si no tiene).
  @Get('actual')
  async actual(@UsuarioActual() quien: UsuarioAutenticado) {
    return { turno: await this.turnos.actual(quien) };
  }

  @Get('sin-turno')
  @RequierePermiso(PERMISOS.CAJA_SUPERVISAR)
  sinTurno(@HotelActual() hotel: ContextoHotel) {
    return this.turnos.sinTurno(hotel.id);
  }

  @Get()
  listar(
    @HotelActual() hotel: ContextoHotel,
    @UsuarioActual() quien: UsuarioAutenticado,
    @Query() query: ListarTurnosDto,
  ) {
    return this.turnos.listar(hotel, quien, query.desde, query.hasta, query.usuarioId);
  }

  @Post(':id/cerrar')
  @HttpCode(200)
  cerrar(
    @HotelActual() hotel: ContextoHotel,
    @Param('id') id: string,
    @Body() dto: CerrarTurnoDto,
    @UsuarioActual() quien: UsuarioAutenticado,
  ) {
    return this.turnos.cerrar(hotel, id, dto, quien);
  }
}
