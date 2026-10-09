import { INestApplication } from '@nestjs/common';
import type TestAgent from 'supertest/lib/agent';
import { PrismaService } from '../src/prisma/prisma.service';
import { RelojFalso, crearApp, crearHabitacion, cuerpoReserva, reiniciar } from './utilidades';

// Reglas de negocio del bloque A (docs/REGLAS_DE_NEGOCIO.md).
// "Ahora" arranca en 2030-01-01 12:00 hora de Colombia en cada prueba.
describe('Reglas de reserva', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: () => TestAgent;
  let reloj: RelojFalso;
  let habitacionId: string;

  beforeAll(async () => {
    ({ app, prisma, reloj, http } = await crearApp());
  });

  beforeEach(async () => {
    await reiniciar(prisma, reloj);
    habitacionId = (await crearHabitacion(prisma, { tarifaNoche: 80000 })).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const reservar = (entrada: string, salida: string) =>
    http()
      .post('/reservas')
      .send(cuerpoReserva(habitacionId, entrada, salida));

  const estadoDe = async (id: string) =>
    (await prisma.reserva.findUniqueOrThrow({ where: { id } })).estado;

  describe('fechas válidas (R3, R4)', () => {
    it('rechaza con 400 una entrada en el pasado', async () => {
      const res = await reservar('2029-12-31', '2030-01-03').expect(400);
      expect(res.body.message).toMatch(/pasado/);
    });

    it('permite reservar para hoy mismo', async () => {
      await reservar('2030-01-01', '2030-01-02').expect(201);
    });

    it('usa el día de Colombia, no el de UTC', async () => {
      // 1 de enero 21:00 en Colombia ya es 2 de enero en UTC: "hoy" sigue siendo el 1.
      reloj.fijar('2030-01-01T21:00:00-05:00');
      await reservar('2030-01-01', '2030-01-02').expect(201);
    });

    it('acepta 30 noches y rechaza 31', async () => {
      await reservar('2030-03-01', '2030-03-31').expect(201);
      const res = await reservar('2030-05-01', '2030-06-01').expect(400);
      expect(res.body.message).toMatch(/30 noches/);
    });

    it('acepta 365 días de antelación y rechaza 366', async () => {
      await reservar('2031-01-01', '2031-01-02').expect(201);
      const res = await reservar('2031-01-02', '2031-01-03').expect(400);
      expect(res.body.message).toMatch(/365 días/);
    });

    it('congela el precio al reservar (R5) e informa hasta cuándo se cancela gratis', async () => {
      const res = await reservar('2030-03-10', '2030-03-15').expect(201);

      expect(Number(res.body.valorAlojamiento)).toBe(5 * 80000);
      expect(res.body.noches).toBe(5);
      // 10 de marzo 15:00 (check-in) menos 48 h = 8 de marzo 15:00 en Colombia.
      expect(new Date(res.body.cancelacionGratuitaHasta)).toEqual(
        new Date('2030-03-08T15:00:00-05:00'),
      );
    });
  });

  describe('cancelación (R8, R9, R11)', () => {
    it('es gratuita hasta 48 h antes del check-in', async () => {
      const { body } = await reservar('2030-03-10', '2030-03-15').expect(201);
      reloj.fijar('2030-03-08T15:00:00-05:00');

      const res = await http().post(`/reservas/${body.id}/cancelar`).expect(201);

      expect(res.body.estado).toBe('cancelada');
      expect(Number(res.body.total)).toBe(0);
    });

    it('cobra una noche de penalidad si es tardía', async () => {
      const { body } = await reservar('2030-03-10', '2030-03-15').expect(201);
      reloj.fijar('2030-03-08T15:01:00-05:00');

      const res = await http().post(`/reservas/${body.id}/cancelar`).expect(201);

      expect(Number(res.body.total)).toBe(80000);
    });

    it('libera las fechas de inmediato para otra reserva', async () => {
      const { body } = await reservar('2030-03-10', '2030-03-15').expect(201);
      await http().post(`/reservas/${body.id}/cancelar`).expect(201);

      await reservar('2030-03-10', '2030-03-15').expect(201);
    });

    it('no permite cancelar una estadía activa ni una ya cancelada', async () => {
      const activa = await reservar('2030-01-01', '2030-01-03').expect(201);
      await http().post(`/reservas/${activa.body.id}/check-in`).expect(201);
      await http().post(`/reservas/${activa.body.id}/cancelar`).expect(400);

      const otra = await reservar('2030-03-10', '2030-03-15').expect(201);
      await http().post(`/reservas/${otra.body.id}/cancelar`).expect(201);
      await http().post(`/reservas/${otra.body.id}/cancelar`).expect(400);
    });

    it('responde 404 si la reserva no existe', async () => {
      await http().post('/reservas/no-existe/cancelar').expect(404);
    });
  });

  describe('no-show (R10)', () => {
    const procesar = () => http().post('/reservas/no-shows/procesar').expect(200);

    it('no marca la reserva antes del mediodía del día siguiente a la entrada', async () => {
      const { body } = await reservar('2030-03-10', '2030-03-15').expect(201);
      reloj.fijar('2030-03-11T11:59:00-05:00');

      expect((await procesar()).body.marcadas).toEqual([]);
      expect(await estadoDe(body.id)).toBe('confirmada');
    });

    it('marca no-show, cobra una noche y libera las noches restantes', async () => {
      const { body } = await reservar('2030-03-10', '2030-03-15').expect(201);
      reloj.fijar('2030-03-11T12:00:00-05:00');

      expect((await procesar()).body.marcadas).toEqual([body.id]);

      const reserva = await prisma.reserva.findUniqueOrThrow({ where: { id: body.id } });
      expect(reserva.estado).toBe('no_show');
      expect(Number(reserva.total)).toBe(80000);
      // Las noches que el huésped no usó se pueden volver a vender.
      await reservar('2030-03-11', '2030-03-15').expect(201);
    });

    it('no toca estadías activas ni reservas futuras', async () => {
      const activa = await reservar('2030-01-01', '2030-01-05').expect(201);
      await http().post(`/reservas/${activa.body.id}/check-in`).expect(201);
      const futura = await reservar('2030-02-01', '2030-02-03').expect(201);
      reloj.fijar('2030-01-03T12:00:00-05:00');

      expect((await procesar()).body.marcadas).toEqual([]);
      expect(await estadoDe(activa.body.id)).toBe('activa');
      expect(await estadoDe(futura.body.id)).toBe('confirmada');
    });
  });
});
