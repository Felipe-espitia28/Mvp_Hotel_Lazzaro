import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
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
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    // Registrada como guardia global: protege todos los endpoints de la app.
    { provide: APP_GUARD, useClass: GuardiaAcceso },
  ],
})
export class AuthModule {}
