import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GuardiaAcceso } from './guardia-acceso';

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      useFactory: () => {
        const secreto = process.env.JWT_SECRET;
        if (!secreto) {
          throw new Error('Falta la variable de entorno JWT_SECRET');
        }
        // La sesión dura un turno de recepción.
        return { secret: secreto, signOptions: { expiresIn: '8h' } };
      },
    }),
    // Límite de intentos de inicio de sesión por IP (contra ataques de fuerza
    // bruta). Solo se aplica al login, con @UseGuards(ThrottlerGuard).
    ThrottlerModule.forRootAsync({
      useFactory: () => ({
        throttlers: [{ ttl: 60_000, limit: Number(process.env.LOGIN_INTENTOS_POR_MINUTO ?? 5) }],
        errorMessage:
          'Demasiados intentos de inicio de sesión. Espera un minuto e inténtalo de nuevo.',
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    // Registrada como guardia global: protege todos los endpoints de la app.
    { provide: APP_GUARD, useClass: GuardiaAcceso },
  ],
})
export class AuthModule {}
