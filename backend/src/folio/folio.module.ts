import { Module } from '@nestjs/common';
import {
  CuentasPorCobrarController,
  FolioController,
  SaldosAFavorController,
} from './folio.controller';
import { FolioService } from './folio.service';
import { ServiciosModule } from '../servicios/servicios.module';

@Module({
  imports: [ServiciosModule],
  controllers: [FolioController, CuentasPorCobrarController, SaldosAFavorController],
  providers: [FolioService],
  exports: [FolioService],
})
export class FolioModule {}
