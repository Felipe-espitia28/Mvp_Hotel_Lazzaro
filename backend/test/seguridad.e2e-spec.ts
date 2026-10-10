import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { crearApp } from './utilidades';

describe('Seguridad básica y salud', () => {
  let app: INestApplication;
  const servidor = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app } = await crearApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /salud responde sin sesión y revisa la base de datos', async () => {
    const res = await servidor().get('/salud').expect(200);
    expect(res.body).toEqual({ estado: 'ok', baseDeDatos: 'ok' });
  });

  it('envía cabeceras de seguridad (helmet)', async () => {
    const res = await servidor().get('/salud');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('CORS solo autoriza al frontend configurado', async () => {
    const permitido = await servidor()
      .options('/reservas')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST');
    expect(permitido.headers['access-control-allow-origin']).toBe('http://localhost:5173');

    const ajeno = await servidor()
      .options('/reservas')
      .set('Origin', 'https://sitio-malicioso.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(ajeno.headers['access-control-allow-origin']).toBeUndefined();
  });

  describe('límite de intentos de login', () => {
    let appLimitada: INestApplication;
    const anterior = process.env.LOGIN_INTENTOS_POR_MINUTO;

    beforeAll(async () => {
      // App aparte con un límite bajo (el resto de las pruebas usa uno alto).
      process.env.LOGIN_INTENTOS_POR_MINUTO = '3';
      ({ app: appLimitada } = await crearApp());
    });

    afterAll(async () => {
      process.env.LOGIN_INTENTOS_POR_MINUTO = anterior;
      await appLimitada.close();
    });

    it('bloquea con 429 tras demasiados intentos seguidos', async () => {
      const intentar = () =>
        request(appLimitada.getHttpServer())
          .post('/auth/login')
          .send({ email: 'atacante@hotel.test', contrasena: 'adivinando' });

      for (let i = 0; i < 3; i++) {
        await intentar().expect(401);
      }
      const bloqueado = await intentar().expect(429);
      expect(bloqueado.body.message).toMatch(/Demasiados intentos/);
    });
  });
});
