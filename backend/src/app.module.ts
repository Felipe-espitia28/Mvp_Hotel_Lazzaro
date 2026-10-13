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
  ],
  controllers: [SaludController],
})
export class AppModule {}
