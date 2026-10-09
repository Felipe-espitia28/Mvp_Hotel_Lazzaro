import { Global, Module } from '@nestjs/common';
import { Reloj } from './reloj';

// Utilidades del hotel compartidas por todos los módulos.
@Global()
@Module({
  providers: [Reloj],
  exports: [Reloj],
})
export class HotelModule {}
