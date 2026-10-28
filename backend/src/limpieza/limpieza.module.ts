import { Module } from '@nestjs/common';
import { IncidenciasController, LimpiezaController } from './limpieza.controller';
import { IncidenciasService } from './incidencias.service';
import { LimpiezaService } from './limpieza.service';

@Module({
  controllers: [LimpiezaController, IncidenciasController],
  providers: [LimpiezaService, IncidenciasService],
})
export class LimpiezaModule {}
