import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

// Documentación interactiva de la API en /docs (Swagger / OpenAPI), generada
// a partir de los controladores y DTOs. Permite probar los endpoints desde el
// navegador: primero POST /auth/login y luego "Authorize" con el token.
export function publicarDocumentacion(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('MVP Hotel — API')
    .setDescription(
      'Módulo hotelero para Lazaro Software: habitaciones, reservas sin sobreventa, ' +
        'estadías, huéspedes, usuarios y auditoría. Reglas de negocio en docs/REGLAS_DE_NEGOCIO.md.',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .addSecurityRequirements('bearer')
    .build();

  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config), {
    swaggerOptions: { persistAuthorization: true },
  });
}
