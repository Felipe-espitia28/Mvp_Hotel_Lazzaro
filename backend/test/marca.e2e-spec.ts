import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { PrismaService } from '../src/prisma/prisma.service';
import { HOTELES_PRUEBA, RelojFalso, crearApp, reiniciar } from './utilidades';

// PNG de 1×1 px: un logo válido mínimo.
const LOGO_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

// Marca del hotel: el administrador personaliza logo, colores, tipografías y
// eslogan; la pantalla de ingreso con marca la muestra sin iniciar sesión.
describe('Marca del hotel', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reloj: RelojFalso;
  let http: () => TestAgent; // admin
  let comoRecepcionista: TestAgent;

  const publico = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, prisma, reloj, http, comoRecepcionista } = await crearApp());
  });

  beforeEach(async () => {
    await reiniciar(prisma, reloj);
    await prisma.hotel.update({
      where: { id: HOTELES_PRUEBA.principal.id },
      data: { logo: null, colorPrimario: '#0f1b2d', eslogan: null },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('el administrador cambia la marca y todo su equipo la ve', async () => {
    const { body } = await http()
      .patch('/hotel/marca')
      .send({
        colorPrimario: '#0e6e78',
        colorAcento: '#f2994a',
        fuenteTitulos: 'Lora',
        fuenteTexto: 'Nunito Sans',
        eslogan: 'Descanso en la montaña',
        logo: LOGO_PNG,
      })
      .expect(200);
    expect(body).toMatchObject({ colorPrimario: '#0e6e78', fuenteTitulos: 'Lora', logo: LOGO_PNG });

    const { body: comoLoVeRecepcion } = await comoRecepcionista.get('/hotel').expect(200);
    expect(comoLoVeRecepcion.eslogan).toBe('Descanso en la montaña');

    // Quitar el logo.
    const sinLogo = await http().patch('/hotel/marca').send({ logo: null }).expect(200);
    expect(sinLogo.body.logo).toBeNull();
  });

  it('rechaza colores, tipografías y logos no válidos', async () => {
    await http().patch('/hotel/marca').send({ colorPrimario: 'rojo' }).expect(400);
    await http().patch('/hotel/marca').send({ fuenteTitulos: 'Comic Sans' }).expect(400);
    // SVG no: puede llevar scripts.
    await http()
      .patch('/hotel/marca')
      .send({ logo: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' })
      .expect(400);
    await http()
      .patch('/hotel/marca')
      .send({ logo: 'https://otro-sitio.com/logo.png' })
      .expect(400);
    const pesado = `data:image/png;base64,${'A'.repeat(300_000)}`;
    await http().patch('/hotel/marca').send({ logo: pesado }).expect(400);
  });

  it('solo el administrador cambia la marca', async () => {
    await comoRecepcionista.patch('/hotel/marca').send({ colorPrimario: '#000000' }).expect(403);
  });

  it('el ingreso con marca muestra solo lo visual, sin iniciar sesión', async () => {
    await http().patch('/hotel/marca').send({ eslogan: 'Bienvenidos', logo: LOGO_PNG }).expect(200);

    const { body } = await publico().get('/publico/hoteles/hotel-prueba/marca').expect(200);
    expect(body).toEqual({
      slug: 'hotel-prueba',
      nombre: 'Hotel Prueba',
      eslogan: 'Bienvenidos',
      logo: LOGO_PNG,
      colorPrimario: '#0f1b2d',
      colorAcento: '#c9a227',
      fuenteTitulos: 'Playfair Display',
      fuenteTexto: 'Inter',
    });

    await publico().get('/publico/hoteles/no-existe/marca').expect(404);
    // Un hotel suspendido no muestra su marca.
    await prisma.hotel.update({
      where: { id: HOTELES_PRUEBA.principal.id },
      data: { activo: false },
    });
    await publico().get('/publico/hoteles/hotel-prueba/marca').expect(404);
  });
});
