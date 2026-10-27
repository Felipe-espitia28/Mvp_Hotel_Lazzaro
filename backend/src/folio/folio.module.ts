import { Module } from '@nestjs/common';
import { CuentasPorCobrarController, FolioController } from './folio.controller';
import { FolioService } from './folio.service';
import { ProductosModule } from '../productos/productos.module';

@Module({
  imports: [ProductosModule],
  controllers: [FolioController, CuentasPorCobrarController],
  providers: [FolioService],
  exports: [FolioService],
})
export class FolioModule {}
