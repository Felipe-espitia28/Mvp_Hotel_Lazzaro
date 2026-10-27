import { Global, Module } from '@nestjs/common';
import { Reloj } from './reloj';
import { HotelController } from './hotel.controller';
import { HotelService } from './hotel.service';
import { PoliticaDatosService } from './politica-datos';

// Utilidades del hotel compartidas por todos los módulos (el reloj) y la
// configuración del hotel que maneja su Gerencia (con su política de datos).
@Global()
@Module({
  controllers: [HotelController],
  providers: [Reloj, HotelService, PoliticaDatosService],
  exports: [Reloj, HotelService, PoliticaDatosService],
})
export class HotelModule {}
