import { Module } from '@nestjs/common';
import { HuespedesModule } from '../huespedes/huespedes.module';
import { ReservasController } from './reservas.controller';
import { ReservasService } from './reservas.service';

@Module({
  imports: [HuespedesModule],
  controllers: [ReservasController],
  providers: [ReservasService],
})
export class ReservasModule {}
