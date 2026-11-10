import { AdaptadorBrevo } from './brevo.adaptador';
import { AdaptadorCorreoSimulado } from './correo-simulado.adaptador';
import { ICorreo, ProveedorCorreo } from './puerto';

// Plan 18: el interruptor, como el de la pasarela (pagos-en-linea/pasarelas.ts).
// CORREO_PROVEEDOR=simulado|brevo (por defecto simulado); se lee en cada envío.
export function proveedorCorreo(env = process.env): ProveedorCorreo {
  const valor = env.CORREO_PROVEEDOR ?? 'simulado';
  if (valor !== 'simulado' && valor !== 'brevo') {
    throw new Error(`CORREO_PROVEEDOR debe ser simulado o brevo (no "${valor}")`);
  }
  return valor;
}

// En producción el correo simulado está prohibido, y Brevo necesita su llave
// y un remitente: el arranque falla antes de dejar a alguien sin su acceso.
export function verificarCorreoParaProduccion(env = process.env) {
  const proveedor = proveedorCorreo(env);
  if (env.NODE_ENV === 'production' && proveedor === 'simulado') {
    throw new Error(
      'En producción no se puede usar el correo simulado: configura CORREO_PROVEEDOR=brevo',
    );
  }
  if (proveedor === 'brevo' && (!env.BREVO_API_KEY || !env.CORREO_REMITENTE_EMAIL)) {
    throw new Error('Con CORREO_PROVEEDOR=brevo faltan BREVO_API_KEY o CORREO_REMITENTE_EMAIL');
  }
}

export function adaptadorCorreo(env = process.env): ICorreo {
  if (proveedorCorreo(env) === 'simulado') return new AdaptadorCorreoSimulado();
  return new AdaptadorBrevo({
    apiKey: env.BREVO_API_KEY ?? '',
    remitenteEmail: env.CORREO_REMITENTE_EMAIL ?? '',
    remitenteNombre: env.CORREO_REMITENTE_NOMBRE || 'Lazaro Software',
  });
}
