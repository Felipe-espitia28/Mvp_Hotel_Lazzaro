import { INestApplication } from '@nestjs/common';
import type TestAgent from 'supertest/lib/agent';
import { PrismaService } from '../src/prisma/prisma.service';
import { RelojFalso, crearApp, crearHabitacion, cuerpoReserva, reiniciar } from './utilidades';

// R24: si el huésped se va antes, se cobran solo las noches usadas y las
// restantes quedan libres. Estadía de prueba: 10→14 mar 2030 (4 noches de
// temporada baja a $80.000, huésped con pasaporte: sin IVA).
describe('Salida anticipada (R24)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reloj: RelojFalso;
  let http: () => TestAgent;
  let habitacionId: string;
  let reservaId: string;

  beforeAll(async () => {
    ({ app, prisma, reloj, http } = await crearApp());
  });

  beforeEach(async () => {
    await reiniciar(prisma, reloj);
    habitacionId = (await crearHabitacion(prisma)).id;
    const res = await http()
      .post('/reservas')
      .send(cuerpoReserva(habitacionId, '2030-03-10', '2030-03-14'))
      .expect(201);
    reservaId = res.body.id;
    reloj.fijar('2030-03-10T15:00:00-05:00');
    await http()
      .post(`/reservas/${reservaId}/check-in`)
      .send({ nacionalidad: 'CO', procedencia: 'Bogotá', motivoViaje: 'turismo' })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  const checkOut = () =>
    http().post(`/reservas/${reservaId}/check-out`).send({ medioPago: 'efectivo' }).expect(201);

  it('cobra solo las noches usadas y acorta la estadía', async () => {
    reloj.fijar('2030-03-12T10:00:00-05:00'); // se va tras 2 noches

    const res = await checkOut();

    expect(Number(res.body.total)).toBe(2 * 80000);
    expect(res.body.fechaSalida).toBe('2030-03-12T00:00:00.000Z');
    expect(res.body.noches).toBe(2);
    expect(Number(res.body.valorAlojamiento)).toBe(160000);
    expect(res.body.desglose.noches).toHaveLength(2);
  });

  it('libera las noches que no usó para otra reserva', async () => {
    reloj.fijar('2030-03-12T10:00:00-05:00');
    await checkOut();

    const otra = await http()
      .post('/reservas')
      .send({
        ...cuerpoReserva(habitacionId, '2030-03-12', '2030-03-14'),
        huesped: { nombre: 'Otro', tipoDocumento: 'PASAPORTE', documento: '999' },
      });
    expect(otra.status).toBe(201);
  });

  it('cobra al menos una noche si se va el mismo día que llegó', async () => {
    reloj.fijar('2030-03-10T21:00:00-05:00');

    const res = await checkOut();

    expect(Number(res.body.total)).toBe(80000);
  });

  it('en la fecha pactada o después cobra lo pactado (la demora va como cargo)', async () => {
    reloj.fijar('2030-03-15T13:00:00-05:00'); // un día tarde

    const res = await checkOut();

    expect(Number(res.body.total)).toBe(4 * 80000);
    expect(res.body.fechaSalida).toBe('2030-03-14T00:00:00.000Z');
  });

  it('el folio anticipa la liquidación y la auditoría guarda lo pactado', async () => {
    reloj.fijar('2030-03-11T09:00:00-05:00');

    const folio = (await http().get(`/reservas/${reservaId}/folio`).expect(200)).body;
    expect(folio.salidaAnticipada).toMatchObject({ nochesPactadas: 4, nochesACobrar: 1 });
    expect(Number(folio.salidaAnticipada.totalACobrar)).toBe(80000);

    await checkOut();
    const historial = (await http().get(`/reservas/${reservaId}/historial`).expect(200)).body;
    expect(historial.at(-1).detalle).toBe(
      'Total $80.000 · salida anticipada: 1 de 4 noches (pactado $320.000) · efectivo',
    );
  });

  it('el folio no anuncia salida anticipada si se va en la fecha pactada', async () => {
    reloj.fijar('2030-03-14T09:00:00-05:00');
    const folio = (await http().get(`/reservas/${reservaId}/folio`).expect(200)).body;
    expect(folio.salidaAnticipada).toBeNull();
  });
});
