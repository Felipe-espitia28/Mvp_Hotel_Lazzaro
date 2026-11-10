import { AdaptadorBrevo, URL_BREVO } from './brevo.adaptador';
import {
  escaparHtml,
  plantillaContrasenaCambiada,
  plantillaCredenciales,
  plantillaRecuperacion,
} from './plantillas';
import { proveedorCorreo, verificarCorreoParaProduccion } from './proveedores';

const MARCA = {
  nombre: 'Hotel Andino',
  color: '#123456',
  enlaceIngreso: 'http://localhost:5173/?hotel=hotel-andino',
};

describe('Plantillas de correo', () => {
  it('escapan el HTML de los datos', () => {
    const { html, texto } = plantillaCredenciales({
      marca: MARCA,
      nombre: '<script>alert(1)</script>',
      email: 'rosa@hotel.co',
      temporal: 'Abc23456defg',
      venceEn: new Date('2030-01-04T17:00:00Z'),
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    // El texto plano no es HTML: va tal cual.
    expect(texto).toContain('Abc23456defg');
    expect(escaparHtml(`"a" & 'b'`)).toBe('&quot;a&quot; &amp; &#39;b&#39;');
  });

  it('llevan el enlace al ingreso del hotel, su nombre y su color', () => {
    const { asunto, html, texto } = plantillaCredenciales({
      marca: MARCA,
      nombre: 'Rosa',
      email: 'rosa@hotel.co',
      temporal: 'Abc23456defg',
      venceEn: new Date('2030-01-04T17:00:00Z'),
    });
    expect(asunto).toContain('Hotel Andino');
    expect(html).toContain('href="http://localhost:5173/?hotel=hotel-andino"');
    expect(html).toContain('#123456');
    expect(texto).toContain('http://localhost:5173/?hotel=hotel-andino');
  });

  it('un color que no es hexadecimal no entra al CSS', () => {
    const { html } = plantillaContrasenaCambiada({
      marca: { ...MARCA, color: 'red;background:url(x)' },
      nombre: 'Rosa',
      fecha: new Date(),
    });
    expect(html).not.toContain('url(x)');
  });

  it('la recuperación lleva su enlace y la vigencia', () => {
    const { texto, html } = plantillaRecuperacion({
      marca: MARCA,
      nombre: 'Rosa',
      enlace: 'http://localhost:5173/restablecer?token=abc',
      minutos: 30,
    });
    expect(texto).toContain('http://localhost:5173/restablecer?token=abc');
    expect(html).toContain('30 minutos');
  });
});

describe('Adaptador de Brevo', () => {
  const config = {
    apiKey: 'xkeysib-prueba',
    remitenteEmail: 'no-responder@lazaro.co',
    remitenteNombre: 'Lazaro',
  };
  const correo = {
    para: 'rosa@hotel.co',
    nombre: 'Rosa',
    asunto: 'Hola',
    html: '<p>Hola</p>',
    texto: 'Hola',
  };

  function fetchFalso(status: number, cuerpo: unknown) {
    const llamadas: { url: string; init?: RequestInit }[] = [];
    const pedir = (url: string, init?: RequestInit) => {
      llamadas.push({ url, init });
      return Promise.resolve(new Response(JSON.stringify(cuerpo), { status }));
    };
    return { pedir, llamadas };
  }

  it('envía a la API transaccional con la api-key y lee el messageId', async () => {
    const { pedir, llamadas } = fetchFalso(201, { messageId: '<abc@relay.brevo.com>' });
    const brevo = new AdaptadorBrevo(config, pedir);
    expect(await brevo.enviar(correo)).toEqual({ idMensaje: '<abc@relay.brevo.com>' });
    expect(llamadas[0].url).toBe(URL_BREVO);
    expect(llamadas[0].init?.method).toBe('POST');
    expect((llamadas[0].init?.headers as Record<string, string>)['api-key']).toBe('xkeysib-prueba');
    expect(JSON.parse(llamadas[0].init?.body as string)).toEqual({
      sender: { name: 'Lazaro', email: 'no-responder@lazaro.co' },
      to: [{ email: 'rosa@hotel.co', name: 'Rosa' }],
      subject: 'Hola',
      htmlContent: '<p>Hola</p>',
      textContent: 'Hola',
    });
  });

  it('lanza un error ante un 4xx, un 5xx o un tiempo de espera vencido', async () => {
    const malo = new AdaptadorBrevo(
      config,
      fetchFalso(400, { code: 'unauthorized', message: 'Key not found' }).pedir,
    );
    await expect(malo.enviar(correo)).rejects.toThrow('Brevo respondió 400: Key not found');
    await expect(
      new AdaptadorBrevo(config, fetchFalso(500, {}).pedir).enviar(correo),
    ).rejects.toThrow('500');
    const lento = new AdaptadorBrevo(config, () =>
      Promise.reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError')),
    );
    await expect(lento.enviar(correo)).rejects.toThrow(/timeout/);
  });
});

describe('Interruptor del correo', () => {
  it('por defecto es el simulado y rechaza valores desconocidos', () => {
    expect(proveedorCorreo({})).toBe('simulado');
    expect(() => proveedorCorreo({ CORREO_PROVEEDOR: 'otro' })).toThrow();
  });

  it('en producción el simulado impide arrancar; Brevo exige su llave y remitente', () => {
    expect(() => verificarCorreoParaProduccion({ NODE_ENV: 'production' })).toThrow(/simulado/);
    expect(() =>
      verificarCorreoParaProduccion({ NODE_ENV: 'production', CORREO_PROVEEDOR: 'brevo' }),
    ).toThrow(/BREVO_API_KEY/);
    expect(() =>
      verificarCorreoParaProduccion({
        NODE_ENV: 'production',
        CORREO_PROVEEDOR: 'brevo',
        BREVO_API_KEY: 'xkeysib-1',
        CORREO_REMITENTE_EMAIL: 'no-responder@lazaro.co',
      }),
    ).not.toThrow();
    expect(() => verificarCorreoParaProduccion({ NODE_ENV: 'development' })).not.toThrow();
  });
});
