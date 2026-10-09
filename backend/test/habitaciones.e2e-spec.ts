import { INestApplication } from '@nestjs/common';
import type TestAgent from 'supertest/lib/agent';
import { PrismaService } from '../src/prisma/prisma.service';
import { crearApp, limpiarBD } from './utilidades';

describe('POST /habitaciones', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: () => TestAgent;

  beforeAll(async () => {
    ({ app, prisma, http } = await crearApp());
  });

  beforeEach(async () => {
    await limpiarBD(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  const crear = (cuerpo: object) => http().post('/habitaciones').send(cuerpo);

  it('crea una habitación con 201 y estado libre', async () => {
    const res = await crear({ numero: '101', tipo: 'sencilla', tarifaNoche: 80000 }).expect(201);

    expect(res.body.estado).toBe('libre');
    expect(Number(res.body.tarifaNoche)).toBe(80000);
  });

  it('rechaza con 409 un número de habitación repetido', async () => {
    await crear({ numero: '101', tipo: 'sencilla', tarifaNoche: 80000 }).expect(201);

    const res = await crear({ numero: '101', tipo: 'doble', tarifaNoche: 130000 }).expect(409);
    expect(res.body.message).toMatch(/101/);
    expect(await prisma.habitacion.count()).toBe(1);
  });

  it.each([
    ['sin número', { tipo: 'sencilla', tarifaNoche: 80000 }],
    ['con tarifa negativa', { numero: '101', tipo: 'sencilla', tarifaNoche: -1 }],
    ['con tarifa como texto', { numero: '101', tipo: 'sencilla', tarifaNoche: 'mucho' }],
    [
      'con campos no permitidos',
      { numero: '101', tipo: 'sencilla', tarifaNoche: 1, estado: 'ocupada' },
    ],
  ])('rechaza con 400 una habitación %s', async (_caso, cuerpo) => {
    await crear(cuerpo).expect(400);
  });
});
