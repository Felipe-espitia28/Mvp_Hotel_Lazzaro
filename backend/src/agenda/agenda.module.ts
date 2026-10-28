import { Module } from '@nestjs/common';
import { AgendaController, CitasController, SalidasController } from './agenda.controller';
import { AgendaService } from './agenda.service';
import { HuespedesModule } from '../huespedes/huespedes.module';

@Module({
  imports: [HuespedesModule],
  controllers: [AgendaController, CitasController, SalidasController],
  providers: [AgendaService],
})
export class AgendaModule {}
