import { Module } from '@nestjs/common';
import {
  CuentasPorCobrarController,
  FolioController,
  SaldosAFavorController,
} from './folio.controller';
import { FolioService } from './folio.service';
import { ProductosModule } from '../productos/productos.module';

@Module({
  imports: [ProductosModule],
  controllers: [FolioController, CuentasPorCobrarController, SaldosAFavorController],
  providers: [FolioService],
  exports: [FolioService],
})
export class FolioModule {}
