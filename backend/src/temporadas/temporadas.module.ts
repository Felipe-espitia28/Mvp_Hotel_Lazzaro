import { Module } from '@nestjs/common';
import { TemporadasController } from './temporadas.controller';
import { TemporadasService } from './temporadas.service';

@Module({
  controllers: [TemporadasController],
  providers: [TemporadasService],
})
export class TemporadasModule {}
