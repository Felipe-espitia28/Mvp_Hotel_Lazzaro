import { Module } from '@nestjs/common';
import { ServiciosController } from './servicios.controller';
import { ImportarServiciosService } from './importar-servicios.service';
import { ServiciosService } from './servicios.service';

@Module({
  controllers: [ServiciosController],
  providers: [ServiciosService, ImportarServiciosService],
  // El folio carga consumos tomados del catálogo.
  exports: [ServiciosService],
})
export class ServiciosModule {}
