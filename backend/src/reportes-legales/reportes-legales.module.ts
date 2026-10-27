import { Module } from '@nestjs/common';
import { ReportesLegalesController } from './reportes-legales.controller';
import { ReportesLegalesService } from './reportes-legales.service';

@Module({
  controllers: [ReportesLegalesController],
  providers: [ReportesLegalesService],
})
export class ReportesLegalesModule {}
