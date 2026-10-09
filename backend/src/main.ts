import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configurarApp } from './configurar-app';

// Punto de entrada de la aplicación.
async function bootstrap() {
  // Carga backend/.env (JWT_SECRET, etc.) con el soporte nativo de Node.
  // En producción las variables llegan del entorno y el archivo puede no existir.
  try {
    process.loadEnvFile();
  } catch {
    // Sin .env: se usan las variables del entorno.
  }

  const app = await NestFactory.create(AppModule);
  configurarApp(app);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Backend escuchando en http://localhost:${port}`);
}
bootstrap();
