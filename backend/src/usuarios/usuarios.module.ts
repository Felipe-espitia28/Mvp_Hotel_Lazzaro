import { Module } from '@nestjs/common';
import { UsuariosController } from './usuarios.controller';
import { UsuariosService } from './usuarios.service';

@Module({
  controllers: [UsuariosController],
  providers: [UsuariosService],
  // La Consola Lazaro reutiliza la gestión de usuarios para el personal de cada hotel.
  exports: [UsuariosService],
})
export class UsuariosModule {}
