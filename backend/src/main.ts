import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configurarApp } from './configurar-app';
import { debePublicarDocumentacion, publicarDocumentacion } from './documentacion';
import { verificarPasarelaParaProduccion } from './pagos-en-linea/pasarelas';
import { verificarCorreoParaProduccion } from './correo/proveedores';

// Punto de entrada de la aplicación.
async function bootstrap() {
  // Carga backend/.env (JWT_SECRET, etc.) con el soporte nativo de Node.
  // En producción las variables llegan del entorno y el archivo puede no existir.
  try {
    process.loadEnvFile();
  } catch {
    // Sin .env: se usan las variables del entorno.
  }

  // B-2: en producción no se arranca con la pasarela simulada.
  verificarPasarelaParaProduccion();
  // Plan 18: tampoco con el correo simulado (nadie recibiría su acceso).
  verificarCorreoParaProduccion();

  const app = await NestFactory.create(AppModule);
  configurarApp(app);
  const conDocumentacion = debePublicarDocumentacion();
  if (conDocumentacion) publicarDocumentacion(app);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(
    `Backend escuchando en http://localhost:${port} ` +
      (conDocumentacion
        ? '(documentación en /docs)'
        : '(documentación de la API desactivada en producción)'),
  );
}
bootstrap();
