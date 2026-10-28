import { describe, expect, it } from 'vitest';
import { enlaceWhatsApp, paginaPublica, textoDelLink } from './pagosEnLinea';

describe('pagos en línea', () => {
  it('arma el mensaje del link con el primer nombre del huésped', () => {
    expect(
      textoDelLink({
        nombre: 'Luis Alberto Herrera',
        hotel: 'Hotel Andino',
        monto: '$48.000',
        url: 'https://checkout.wompi.co/p/?reference=PG1',
      }),
    ).toBe(
      'Hola Luis, este es el link para pagar $48.000 de tu reserva en Hotel Andino: https://checkout.wompi.co/p/?reference=PG1',
    );
    expect(textoDelLink({ nombre: ' ', hotel: 'H', monto: '$1', url: 'u' })).toBe(
      'Hola, este es el link para pagar $1 de tu reserva en H: u',
    );
  });

  it('el enlace de WhatsApp lleva el texto codificado', () => {
    expect(enlaceWhatsApp('Hola Luis: https://x.co/?a=1&b=2')).toBe(
      'https://wa.me/?text=Hola%20Luis%3A%20https%3A%2F%2Fx.co%2F%3Fa%3D1%26b%3D2',
    );
  });

  it('reconoce las páginas públicas del huésped por la ruta', () => {
    expect(paginaPublica('/pago-simulado', '?referencia=PG1')).toEqual({
      pagina: 'pago-simulado',
      referencia: 'PG1',
    });
    expect(paginaPublica('/pago-resultado', '?referencia=PG1')?.pagina).toBe('pago-resultado');
    expect(paginaPublica('/pago-simulado', '')).toBeNull();
    expect(paginaPublica('/', '?referencia=PG1')).toBeNull();
  });
});
