import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

// D-13: en producción /docs no se publica (mostraría a cualquiera el mapa
// completo de la API), salvo que se pida con PUBLICAR_DOCS=true. PUBLICAR_DOCS=false
// la apaga en cualquier ambiente.
export function debePublicarDocumentacion(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.PUBLICAR_DOCS === 'true') return true;
  if (env.PUBLICAR_DOCS === 'false') return false;
  return env.NODE_ENV !== 'production';
}

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
