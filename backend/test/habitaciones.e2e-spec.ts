import { INestApplication } from '@nestjs/common';
import type TestAgent from 'supertest/lib/agent';
import { PrismaService } from '../src/prisma/prisma.service';
import { crearApp, limpiarBD } from './utilidades';

describe('Habitaciones y tipos de habitación', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: () => TestAgent; // admin
  let comoRecepcionista: TestAgent;
  let tipoDobleId: string;

  beforeAll(async () => {
    ({ app, prisma, http, comoRecepcionista } = await crearApp());
  });

  beforeEach(async () => {
    await limpiarBD(prisma);
    const res = await http().post('/tipos-habitacion').send(TIPO_DOBLE).expect(201);
    tipoDobleId = res.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  const TIPO_DOBLE = {
    codigo: 'doble',
    nombre: 'Doble',
    tarifaBase: 130000,
    capacidadIncluida: 2,
    capacidadMaxima: 3,
    cargoPersonaAdicional: 40000,
  };

  const crear = (cuerpo: object) => http().post('/habitaciones').send(cuerpo);

  describe('POST /habitaciones', () => {
    it('crea una habitación de un tipo, con 201 y estado libre', async () => {
      const res = await crear({ numero: '201', tipoHabitacionId: tipoDobleId }).expect(201);

      expect(res.body.estado).toBe('libre');
      expect(res.body.tipoHabitacion.codigo).toBe('doble');
      expect(Number(res.body.tipoHabitacion.tarifaBase)).toBe(130000);
    });

    it('rechaza con 409 un número de habitación repetido', async () => {
      await crear({ numero: '201', tipoHabitacionId: tipoDobleId }).expect(201);

      const res = await crear({ numero: '201', tipoHabitacionId: tipoDobleId }).expect(409);
      expect(res.body.message).toMatch(/201/);
      expect(await prisma.habitacion.count()).toBe(1);
    });

    it('responde 404 si el tipo no existe', async () => {
      await crear({ numero: '201', tipoHabitacionId: 'no-existe' }).expect(404);
    });

    it.each([
      ['sin número', { tipoHabitacionId: 'x' }],
      ['sin tipo', { numero: '201' }],
      [
        'con tarifa propia (ahora es del tipo)',
        { numero: '201', tipoHabitacionId: 'x', tarifaNoche: 1 },
      ],
    ])('rechaza con 400 una habitación %s', async (_caso, cuerpo) => {
      await crear(cuerpo).expect(400);
    });
  });

  describe('tipos de habitación', () => {
    it('lista los tipos con cuántas habitaciones tiene cada uno', async () => {
      await crear({ numero: '201', tipoHabitacionId: tipoDobleId }).expect(201);

      const res = await comoRecepcionista.get('/tipos-habitacion').expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]._count.habitaciones).toBe(1);
    });

    it('el admin cambia la tarifa de todas las habitaciones del tipo con una edición', async () => {
      await http()
        .patch(`/tipos-habitacion/${tipoDobleId}`)
        .send({ tarifaBase: 150000 })
        .expect(200);

      const res = await http().get('/tipos-habitacion').expect(200);
      expect(Number(res.body[0].tarifaBase)).toBe(150000);
    });

    it('recepción no puede crear ni editar tipos (403)', async () => {
      await comoRecepcionista
        .post('/tipos-habitacion')
        .send({ ...TIPO_DOBLE, codigo: 'otra' })
        .expect(403);
      await comoRecepcionista
        .patch(`/tipos-habitacion/${tipoDobleId}`)
        .send({ tarifaBase: 1 })
        .expect(403);
    });

    it('rechaza códigos repetidos (409) y capacidades incoherentes (400)', async () => {
      await http().post('/tipos-habitacion').send(TIPO_DOBLE).expect(409);
      await http()
        .post('/tipos-habitacion')
        .send({ ...TIPO_DOBLE, codigo: 'rara', capacidadIncluida: 3, capacidadMaxima: 2 })
        .expect(400);
      await http()
        .patch(`/tipos-habitacion/${tipoDobleId}`)
        .send({ capacidadMaxima: 1 }) // menor que la incluida (2)
        .expect(400);
      await http()
        .post('/tipos-habitacion')
        .send({ ...TIPO_DOBLE, codigo: 'Con Espacios' })
        .expect(400);
    });

    it('responde 404 al editar un tipo inexistente', async () => {
      await http().patch('/tipos-habitacion/no-existe').send({ tarifaBase: 1 }).expect(404);
    });
  });
});
