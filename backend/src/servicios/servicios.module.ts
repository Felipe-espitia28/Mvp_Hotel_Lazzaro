import { Module } from '@nestjs/common';
import { ServiciosController } from './servicios.controller';
import { ServiciosService } from './servicios.service';

@Module({
  controllers: [ServiciosController],
  providers: [ServiciosService],
  // El folio carga consumos tomados del catálogo.
  exports: [ServiciosService],
})
export class ServiciosModule {}
