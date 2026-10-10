import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';

// Orígenes (frontends) autorizados a llamar a la API desde un navegador.
// Se configuran con CORS_ORIGENES, separados por coma.
export function origenesPermitidos() {
  return (process.env.CORS_ORIGENES ?? 'http://localhost:5173')
    .split(',')
    .map((origen) => origen.trim())
    .filter(Boolean);
}

// Configuración global compartida entre main.ts y las pruebas e2e, para que
// las pruebas ejerciten la app exactamente como corre en producción.
export function configurarApp(app: INestApplication) {
  // Cabeceras HTTP de seguridad (evitan sniffing de contenido, clickjacking, etc.).
  app.use(helmet());

  // Solo el frontend del hotel puede consumir la API desde un navegador.
  app.enableCors({ origin: origenesPermitidos() });

  // Valida y transforma automáticamente los DTOs de entrada en todos los endpoints.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
}
