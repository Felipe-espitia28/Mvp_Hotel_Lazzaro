import { Global, Module } from '@nestjs/common';
import { CorreoService } from './correo.service';

// Global: lo usan las cuentas de usuario, la plataforma y la recuperación.
@Global()
@Module({
  providers: [CorreoService],
  exports: [CorreoService],
})
export class CorreoModule {}
