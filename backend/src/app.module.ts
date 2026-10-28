import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { HotelModule } from './hotel/hotel.module';
import { AuthModule } from './auth/auth.module';
import { UsuariosModule } from './usuarios/usuarios.module';
import { HabitacionesModule } from './habitaciones/habitaciones.module';
import { ReservasModule } from './reservas/reservas.module';
import { HuespedesModule } from './huespedes/huespedes.module';
import { SaludController } from './salud.controller';
import { PanelModule } from './panel/panel.module';
import { TarifasModule } from './tarifas/tarifas.module';
import { FolioModule } from './folio/folio.module';
import { AgendaModule } from './agenda/agenda.module';
import { CajaModule } from './caja/caja.module';
import { PagosEnLineaModule } from './pagos-en-linea/pagos-en-linea.module';
import { PlataformaModule } from './plataforma/plataforma.module';
import { TemporadasModule } from './temporadas/temporadas.module';
import { ServiciosModule } from './servicios/servicios.module';
import { ReportesLegalesModule } from './reportes-legales/reportes-legales.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    HotelModule,
    AuthModule,
    UsuariosModule,
    HabitacionesModule,
    HuespedesModule,
    ReservasModule,
    PanelModule,
    TarifasModule,
    FolioModule,
    AgendaModule,
    CajaModule,
    PagosEnLineaModule,
    PlataformaModule,
    TemporadasModule,
    ServiciosModule,
    ReportesLegalesModule,
  ],
  controllers: [SaludController],
})
export class AppModule {}
