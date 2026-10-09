import { INestApplication, ValidationPipe } from '@nestjs/common';

// Configuración global compartida entre main.ts y las pruebas e2e, para que
// las pruebas ejerciten la app exactamente como corre en producción.
export function configurarApp(app: INestApplication) {
  // Habilita CORS para que el frontend (Vite, otro puerto) pueda consumir la API.
  app.enableCors();

  // Valida y transforma automáticamente los DTOs de entrada en todos los endpoints.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
}
