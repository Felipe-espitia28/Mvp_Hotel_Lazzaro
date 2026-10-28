import { Proveedor } from './puerto';

// B-2: el interruptor. PASARELA_PROVEEDOR=simulada|wompi (por defecto
// simulada). Se lee en cada llamada para que las pruebas puedan cambiarlo.
export function proveedorActivo(env = process.env): Proveedor {
  const valor = env.PASARELA_PROVEEDOR ?? 'simulada';
  if (valor !== 'simulada' && valor !== 'wompi') {
    throw new Error(`PASARELA_PROVEEDOR debe ser simulada o wompi (no "${valor}")`);
  }
  return valor;
}

// En producción la pasarela simulada está prohibida: el arranque falla.
export function verificarPasarelaParaProduccion(env = process.env) {
  if (env.NODE_ENV === 'production' && proveedorActivo(env) === 'simulada') {
    throw new Error(
      'En producción no se puede usar la pasarela simulada: configura PASARELA_PROVEEDOR=wompi',
    );
  }
}

// Dónde ve el huésped la página de pago y de retorno, y dónde recibe Wompi los eventos.
export const urlPublicaApp = () => process.env.URL_PUBLICA_APP || 'http://localhost:5173';
export const urlPublicaApi = () =>
  process.env.URL_PUBLICA_API || `http://localhost:${process.env.PORT ?? 3000}`;
