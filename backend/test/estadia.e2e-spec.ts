import { INestApplication } from '@nestjs/common';
import type TestAgent from 'supertest/lib/agent';
import { PrismaService } from '../src/prisma/prisma.service';
import { sumarDias } from '../src/hotel/politicas';
import { RelojFalso, crearApp, crearHabitacion, cuerpoReserva, reiniciar } from './utilidades';

// Ciclo de vida de la estadía: confirmada → activa (check-in) → cerrada (check-out),
// y el cálculo del total con el precio pactado (noches × tarifa al reservar).
describe('Check-in / check-out', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: () => TestAgent;
  let reloj: RelojFalso;

  beforeAll(async () => {
    ({ app, prisma, reloj, http } = await crearApp());
  });

  beforeEach(async () => {
    await reiniciar(prisma, reloj);
  });

  afterAll(async () => {
    await app.close();
  });

  // Reserva 10 días antes de la entrada y deja el reloj en el día de llegada
  // a las 15:00, listo para hacer check-in.
  async function reservar(entrada: string, salida: string, tarifaNoche = 80000) {
    const habitacion = await crearHabitacion(prisma, { tarifaNoche });
    const diezDiasAntes = sumarDias(new Date(entrada), -10).toISOString().slice(0, 10);
    reloj.fijar(`${diezDiasAntes}T12:00:00-05:00`);

    const res = await http()
      .post('/reservas')
      .send(cuerpoReserva(habitacion.id, entrada, salida))
      .expect(201);

    reloj.fijar(`${entrada}T15:00:00-05:00`);
    return { reservaId: res.body.id as string, habitacionId: habitacion.id };
  }

  const estadoHabitacion = async (id: string) =>
    (await prisma.habitacion.findUniqueOrThrow({ where: { id } })).estado;

  describe('check-in', () => {
    it('pasa la reserva a activa y la habitación a ocupada', async () => {
      const { reservaId, habitacionId } = await reservar('2030-05-01', '2030-05-04');

      const res = await http().post(`/reservas/${reservaId}/check-in`).expect(201);

      expect(res.body.estado).toBe('activa');
      expect(res.body.habitacion.estado).toBe('ocupada');
      expect(await estadoHabitacion(habitacionId)).toBe('ocupada');
    });

    it('rechaza con 400 un segundo check-in', async () => {
      const { reservaId } = await reservar('2030-05-01', '2030-05-04');
      await http().post(`/reservas/${reservaId}/check-in`).expect(201);

      await http().post(`/reservas/${reservaId}/check-in`).expect(400);
    });

    it('responde 404 si la reserva no existe', async () => {
      await http().post('/reservas/no-existe/check-in').expect(404);
    });

    it('rechaza con 400 el check-in antes de la fecha de entrada', async () => {
      const { reservaId } = await reservar('2030-05-01', '2030-05-04');
      reloj.fijar('2030-04-30T20:00:00-05:00');

      const res = await http().post(`/reservas/${reservaId}/check-in`).expect(400);
      expect(res.body.message).toMatch(/2030-05-01/);
    });

    it('permite el check-in tarde, hasta el mediodía del día siguiente', async () => {
      const { reservaId } = await reservar('2030-05-01', '2030-05-04');
      reloj.fijar('2030-05-02T11:59:00-05:00');

      await http().post(`/reservas/${reservaId}/check-in`).expect(201);
    });

    it('rechaza con 400 el check-in de una reserva vencida (no-show)', async () => {
      const { reservaId } = await reservar('2030-05-01', '2030-05-04');
      reloj.fijar('2030-05-02T12:00:00-05:00');

      const res = await http().post(`/reservas/${reservaId}/check-in`).expect(400);
      expect(res.body.message).toMatch(/no-show/);
    });
  });

  describe('check-out', () => {
    it.each([
      // [entrada, salida, tarifa base, noches esperadas, multiplicador de temporada]
      ['2030-05-01', '2030-05-06', 80000, 5, 1],
      ['2030-05-01', '2030-05-02', 130000, 1, 1],
      ['2030-01-30', '2030-02-02', 220000, 3, 1], // cruza de mes
      ['2028-02-28', '2028-03-01', 250000, 2, 1], // año bisiesto (29 de febrero)
      ['2030-12-30', '2031-01-02', 80000, 3, 1.3], // cruza de año, en temporada alta
    ])(
      'del %s al %s con tarifa %d cobra %d noches',
      async (entrada, salida, tarifa, noches, multiplicador) => {
        const { reservaId } = await reservar(entrada, salida, tarifa);
        await http().post(`/reservas/${reservaId}/check-in`).expect(201);

        const res = await http()
          .post(`/reservas/${reservaId}/check-out`)
          .send({ medioPago: 'efectivo' })
          .expect(201);

        expect(res.body.estado).toBe('cerrada');
        // Prisma serializa los Decimal como string en el JSON.
        expect(Number(res.body.total)).toBe(noches * tarifa * multiplicador);
      },
    );

    it('cobra el precio pactado aunque la tarifa haya cambiado después (R5)', async () => {
      const { reservaId, habitacionId } = await reservar('2030-05-01', '2030-05-06', 80000);
      // El hotel sube la tarifa del tipo después de que el huésped reservó.
      const { tipoHabitacionId } = await prisma.habitacion.findUniqueOrThrow({
        where: { id: habitacionId },
      });
      await prisma.tipoHabitacion.update({
        where: { id: tipoHabitacionId },
        data: { tarifaBase: 150000 },
      });
      await http().post(`/reservas/${reservaId}/check-in`).expect(201);

      const res = await http()
        .post(`/reservas/${reservaId}/check-out`)
        .send({ medioPago: 'efectivo' })
        .expect(201);

      expect(Number(res.body.total)).toBe(5 * 80000);
    });

    it('libera la habitación al cerrar la estadía', async () => {
      const { reservaId, habitacionId } = await reservar('2030-05-01', '2030-05-04');
      await http().post(`/reservas/${reservaId}/check-in`).expect(201);

      const res = await http()
        .post(`/reservas/${reservaId}/check-out`)
        .send({ medioPago: 'efectivo' })
        .expect(201);

      expect(res.body.habitacion.estado).toBe('libre');
      expect(await estadoHabitacion(habitacionId)).toBe('libre');
    });

    it('rechaza con 400 el check-out de una reserva sin check-in', async () => {
      const { reservaId } = await reservar('2030-05-01', '2030-05-04');

      await http()
        .post(`/reservas/${reservaId}/check-out`)
        .send({ medioPago: 'efectivo' })
        .expect(400);
    });

    it('rechaza con 400 un segundo check-out (el folio ya está cerrado)', async () => {
      const { reservaId } = await reservar('2030-05-01', '2030-05-04');
      await http().post(`/reservas/${reservaId}/check-in`).expect(201);
      await http()
        .post(`/reservas/${reservaId}/check-out`)
        .send({ medioPago: 'efectivo' })
        .expect(201);

      await http()
        .post(`/reservas/${reservaId}/check-out`)
        .send({ medioPago: 'efectivo' })
        .expect(400);
    });

    it('responde 404 si la reserva no existe', async () => {
      await http()
        .post('/reservas/no-existe/check-out')
        .send({ medioPago: 'efectivo' })
        .expect(404);
    });
  });
});
