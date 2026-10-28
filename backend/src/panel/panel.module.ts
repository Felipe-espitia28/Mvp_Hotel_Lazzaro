import { Module } from '@nestjs/common';
import { PanelController } from './panel.controller';
import { PanelService } from './panel.service';
import { FolioModule } from '../folio/folio.module';

@Module({
  // B-1: las cuentas por cobrar y los saldos a favor salen del folio.
  imports: [FolioModule],
  controllers: [PanelController],
  providers: [PanelService],
})
export class PanelModule {}
