import { INestApplication } from '@nestjs/common';
import type TestAgent from 'supertest/lib/agent';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  RelojFalso,
  USUARIOS_PRUEBA,
  crearApp,
  crearHabitacion,
  cuerpoReserva,
  reiniciar,
} from './utilidades';

interface Evento {
  tipo: string;
  detalle: string | null;
  usuario: { nombre: string; rol: string } | null;
}

// R34: cada acción sobre una reserva queda registrada con quién la hizo y cuándo.
describe('Auditoría de reservas', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reloj: RelojFalso;
  let http: () => TestAgent; // admin
  let comoRecepcionista: TestAgent;
  let habitacionId: string;

  beforeAll(async () => {
    ({ app, prisma, reloj, http, comoRecepcionista } = await crearApp());
  });

  beforeEach(async () => {
    await reiniciar(prisma, reloj);
    habitacionId = (await crearHabitacion(prisma, { tarifaNoche: 80000 })).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const historial = async (id: string): Promise<Evento[]> =>
    (await http().get(`/reservas/${id}/historial`).expect(200)).body;

  const resumen = (eventos: Evento[]) =>
    eventos.map((e) => [e.tipo, e.usuario?.nombre ?? 'Sistema', e.detalle]);

  it('registra quién creó, hizo check-in y check-out de una estadía', async () => {
    const { body } = await comoRecepcionista
      .post('/reservas')
      .send(cuerpoReserva(habitacionId, '2030-01-01', '2030-01-03'))
      .expect(201);
    await comoRecepcionista.post(`/reservas/${body.id}/check-in`).expect(201);
    await http().post(`/reservas/${body.id}/check-out`).send({ medioPago: 'efectivo' }).expect(201);

    expect(resumen(await historial(body.id))).toEqual([
      ['creada', USUARIOS_PRUEBA.recepcionista.nombre, null],
      ['check_in', USUARIOS_PRUEBA.recepcionista.nombre, null],
      [
        'check_out',
        USUARIOS_PRUEBA.admin.nombre,
        'Total $208.000 · efectivo' /* 2 noches de alta (×1,30) */,
      ],
    ]);
  });

  it('registra la cancelación con su penalidad', async () => {
    const { body } = await http()
      .post('/reservas')
      .send(cuerpoReserva(habitacionId, '2030-01-02', '2030-01-05'))
      .expect(201);
    // Faltan menos de 48 h para la llegada: cancelación tardía.
    await comoRecepcionista.post(`/reservas/${body.id}/cancelar`).expect(201);

    const eventos = await historial(body.id);
    expect(resumen(eventos).at(-1)).toEqual([
      'cancelada',
      USUARIOS_PRUEBA.recepcionista.nombre,
      'Penalidad $104.000',
    ]);
    expect(eventos.at(-1)?.usuario?.rol).toBe('recepcionista');
  });

  it('el no-show automático queda registrado como acción del sistema', async () => {
    const { body } = await http()
      .post('/reservas')
      .send(cuerpoReserva(habitacionId, '2030-01-02', '2030-01-05'))
      .expect(201);
    reloj.fijar('2030-01-03T12:00:00-05:00');

    await http().post('/reservas/no-shows/procesar').expect(200);
    // Procesar de nuevo no duplica el evento.
    await http().post('/reservas/no-shows/procesar').expect(200);

    expect(resumen(await historial(body.id))).toEqual([
      ['creada', USUARIOS_PRUEBA.admin.nombre, null],
      ['no_show', 'Sistema', 'Penalidad $104.000'],
    ]);
  });

  it('una acción rechazada no deja rastro en el historial', async () => {
    const { body } = await http()
      .post('/reservas')
      .send(cuerpoReserva(habitacionId, '2030-03-10', '2030-03-15'))
      .expect(201);

    await http().post(`/reservas/${body.id}/check-out`).send({ medioPago: 'efectivo' }).expect(400); // sin check-in
    await http()
      .post('/reservas')
      .send(cuerpoReserva(habitacionId, '2030-03-12', '2030-03-14'))
      .expect(409);

    expect(await historial(body.id)).toHaveLength(1);
    expect(await prisma.eventoReserva.count()).toBe(1);
  });

  it('un usuario con acciones registradas no se puede borrar de la base', async () => {
    await comoRecepcionista
      .post('/reservas')
      .send(cuerpoReserva(habitacionId, '2030-03-10', '2030-03-15'))
      .expect(201);

    await expect(
      prisma.usuario.delete({ where: { email: USUARIOS_PRUEBA.recepcionista.email } }),
    ).rejects.toThrow();
  });

  it('responde 404 para el historial de una reserva inexistente', async () => {
    await http().get('/reservas/no-existe/historial').expect(404);
  });
});
