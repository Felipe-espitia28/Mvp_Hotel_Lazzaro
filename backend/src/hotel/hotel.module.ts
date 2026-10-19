import { Global, Module } from '@nestjs/common';
import { Reloj } from './reloj';
import { HotelController } from './hotel.controller';
import { HotelService } from './hotel.service';

// Utilidades del hotel compartidas por todos los módulos (el reloj) y la
// configuración del hotel que maneja su Gerencia.
@Global()
@Module({
  controllers: [HotelController],
  providers: [Reloj, HotelService],
  exports: [Reloj, HotelService],
})
export class HotelModule {}
