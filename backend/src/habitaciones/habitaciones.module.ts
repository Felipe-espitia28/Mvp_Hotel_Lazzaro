import { Module } from '@nestjs/common';
import { HabitacionesController } from './habitaciones.controller';
import { HabitacionesService } from './habitaciones.service';
import { LoteHabitacionesService } from './lote-habitaciones.service';

@Module({
  controllers: [HabitacionesController],
  providers: [HabitacionesService, LoteHabitacionesService],
})
export class HabitacionesModule {}
