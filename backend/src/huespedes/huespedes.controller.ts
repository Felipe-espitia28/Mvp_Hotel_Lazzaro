import { Controller, Get, Param, ParseEnumPipe, Query } from '@nestjs/common';
import { TipoDocumento } from '@prisma/client';
import { IsNotEmpty, IsString } from 'class-validator';
import { RequierePermiso } from '../auth/decoradores';
import { PERMISOS } from '../auth/permisos';
import { HuespedesService } from './huespedes.service';

class BuscarHuespedesDto {
  @IsString()
  @IsNotEmpty()
  buscar!: string;
}

// Consulta de huéspedes: la ve quien puede ver reservas (recepción y admin).
@Controller('huespedes')
@RequierePermiso(PERMISOS.RESERVAS_VER)
export class HuespedesController {
  constructor(private readonly huespedesService: HuespedesService) {}

  @Get()
  buscar(@Query() query: BuscarHuespedesDto) {
    return this.huespedesService.buscar(query.buscar);
  }

  // Lo usa el formulario de reserva para reconocer a un cliente que vuelve.
  @Get('documento/:tipo/:documento')
  porDocumento(
    @Param('tipo', new ParseEnumPipe(TipoDocumento)) tipo: TipoDocumento,
    @Param('documento') documento: string,
  ) {
    return this.huespedesService.porDocumento(tipo, documento);
  }

  @Get(':id')
  detalle(@Param('id') id: string) {
    return this.huespedesService.detalle(id);
  }
}
