import { INestApplication } from '@nestjs/common';
import type TestAgent from 'supertest/lib/agent';
import { PrismaService } from '../src/prisma/prisma.service';
import { crearApp, crearHabitacion, cuerpoReserva, limpiarBD } from './utilidades';

describe('GET /habitaciones/disponibles', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: () => TestAgent;
  let h101: string;
  let h102: string;

  beforeAll(async () => {
    ({ app, prisma, http } = await crearApp());
  });

  beforeEach(async () => {
    await limpiarBD(prisma);
    h101 = (await crearHabitacion(prisma, { numero: '101' })).id;
    h102 = (await crearHabitacion(prisma, { numero: '102' })).id;

    // La 101 queda reservada del 10 al 15.
    await http()
      .post('/reservas')
      .send(cuerpoReserva(h101, '2030-07-10', '2030-07-15'))
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  const disponibles = async (desde: string, hasta: string) => {
    const res = await http().get('/habitaciones/disponibles').query({ desde, hasta }).expect(200);
    return res.body.map((h: { id: string }) => h.id);
  };

  it('excluye la habitación con una reserva solapada', async () => {
    expect(await disponibles('2030-07-12', '2030-07-18')).toEqual([h102]);
  });

  it('incluye la habitación si el rango es contiguo a la reserva', async () => {
    expect(await disponibles('2030-07-15', '2030-07-20')).toEqual([h101, h102]);
    expect(await disponibles('2030-07-05', '2030-07-10')).toEqual([h101, h102]);
  });

  it('vuelve a ofrecer la habitación si la reserva se cancela', async () => {
    await prisma.reserva.updateMany({ data: { estado: 'cancelada' } });

    expect(await disponibles('2030-07-12', '2030-07-18')).toEqual([h101, h102]);
  });

  it.each([
    ['iguales', '2030-07-12', '2030-07-12'],
    ['invertidas', '2030-07-18', '2030-07-12'],
  ])('rechaza con 400 fechas %s', async (_caso, desde, hasta) => {
    await http().get('/habitaciones/disponibles').query({ desde, hasta }).expect(400);
  });

  it('rechaza con 400 un rango que empieza en el pasado', async () => {
    // En las pruebas "hoy" es 2030-01-01.
    await http()
      .get('/habitaciones/disponibles')
      .query({ desde: '2029-12-30', hasta: '2030-01-03' })
      .expect(400);
  });

  it('rechaza con 400 fechas con formato inválido', async () => {
    await http()
      .get('/habitaciones/disponibles')
      .query({ desde: 'mañana', hasta: '2030-07-18' })
      .expect(400);
  });
});
