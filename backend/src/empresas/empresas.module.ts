import { Module } from '@nestjs/common';
import { FolioModule } from '../folio/folio.module';
import { EmpresaDeReservaController, EmpresasController } from './empresas.controller';
import { EmpresasService } from './empresas.service';

@Module({
  imports: [FolioModule],
  controllers: [EmpresasController, EmpresaDeReservaController],
  providers: [EmpresasService],
})
export class EmpresasModule {}
