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
    // bruta). Se aplica con @UseGuards(ThrottlerGuard): el login y los
    // endpoints públicos de pagos en línea (con su propio límite).
    ThrottlerModule.forRootAsync({
      useFactory: () => ({
        throttlers: [{ ttl: 60_000, limit: Number(process.env.LOGIN_INTENTOS_POR_MINUTO ?? 5) }],
        // El mismo límite protege el webhook público de la pasarela (B-2).
        errorMessage: (contexto) =>
          contexto.getClass() === AuthController
            ? 'Demasiados intentos de inicio de sesión. Espera un minuto e inténtalo de nuevo.'
            : 'Demasiadas peticiones. Espera un minuto e inténtalo de nuevo.',
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
