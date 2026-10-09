import { Module } from '@nestjs/common';
import { HabitacionesController } from './habitaciones.controller';
import { HabitacionesService } from './habitaciones.service';

@Module({
  controllers: [HabitacionesController],
  providers: [HabitacionesService],
})
export class HabitacionesModule {}
