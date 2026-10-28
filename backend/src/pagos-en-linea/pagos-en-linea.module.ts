import { Module } from '@nestjs/common';
import {
  LinksDePagoController,
  PagosEnLineaController,
  PagosPublicosController,
} from './pagos-en-linea.controller';
import { PagosEnLineaService } from './pagos-en-linea.service';

@Module({
  controllers: [LinksDePagoController, PagosEnLineaController, PagosPublicosController],
  providers: [PagosEnLineaService],
  exports: [PagosEnLineaService],
})
export class PagosEnLineaModule {}
