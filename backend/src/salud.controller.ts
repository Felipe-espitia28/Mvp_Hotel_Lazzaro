import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Publico } from './auth/decoradores';
import { PrismaService } from './prisma/prisma.service';

// Chequeo de salud para el despliegue / monitoreo: la API responde y llega a la BD.
@ApiTags('Salud')
@Controller('salud')
export class SaludController {
  constructor(private readonly prisma: PrismaService) {}

  @Publico()
  @Get()
  async revisar() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({ estado: 'error', baseDeDatos: 'sin conexión' });
    }
    return { estado: 'ok', baseDeDatos: 'ok' };
  }
}
