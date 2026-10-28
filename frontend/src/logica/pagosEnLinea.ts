import type { EstadoIntentoPago } from '../api/types';

// B-2: textos de los links de pago (sin React, para probarlos).

export const ETIQUETA_ESTADO_INTENTO: Record<EstadoIntentoPago, string> = {
  creado: 'Esperando el pago',
  aprobado: 'Pagado',
  rechazado: 'Rechazado',
  expirado: 'Vencido',
};

// El mensaje que recepción le envía al huésped.
export function textoDelLink(datos: { nombre: string; hotel: string; monto: string; url: string }) {
  const primerNombre = datos.nombre.trim().split(/\s+/)[0] ?? '';
  return (
    `Hola${primerNombre ? ` ${primerNombre}` : ''}, este es el link para pagar ${datos.monto} ` +
    `de tu reserva en ${datos.hotel}: ${datos.url}`
  );
}

// WhatsApp abre el chat con el texto escrito; el huésped se elige allí.
export const enlaceWhatsApp = (texto: string) => `https://wa.me/?text=${encodeURIComponent(texto)}`;

// La app no tiene router: las páginas públicas del huésped se eligen por la ruta.
export type PaginaPublica = { pagina: 'pago-simulado' | 'pago-resultado'; referencia: string };

export function paginaPublica(ruta: string, busqueda: string): PaginaPublica | null {
  const referencia = new URLSearchParams(busqueda).get('referencia');
  if (!referencia) return null;
  if (ruta === '/pago-simulado') return { pagina: 'pago-simulado', referencia };
  if (ruta === '/pago-resultado') return { pagina: 'pago-resultado', referencia };
  return null;
}
