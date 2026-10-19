import { Module } from '@nestjs/common';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { PlataformaController } from './plataforma.controller';
import { PlataformaService } from './plataforma.service';

@Module({
  imports: [UsuariosModule],
  controllers: [PlataformaController],
  providers: [PlataformaService],
})
export class PlataformaModule {}
