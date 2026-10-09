import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// Módulo global: cualquier otro módulo puede inyectar PrismaService
// sin tener que importar PrismaModule explícitamente.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
