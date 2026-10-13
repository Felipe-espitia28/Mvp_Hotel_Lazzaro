import { INestApplication } from '@nestjs/common';
import type TestAgent from 'supertest/lib/agent';
import { PrismaService } from '../src/prisma/prisma.service';
import { RelojFalso, crearApp, crearHabitacion, cuerpoReserva, reiniciar } from './utilidades';

// R25 (ciclo de limpieza) y R26 (fuera de servicio). "Hoy": 2030-01-01.
describe('Estados de la habitación', () => {
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
    habitacionId = (await crearHabitacion(prisma)).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const reservar = (entrada: string, salida: string) =>
    http()
      .post('/reservas')
      .send(cuerpoReserva(habitacionId, entrada, salida));
  const cambiarEstado = (estado: string, cliente: TestAgent = http()) =>
    cliente.patch(`/habitaciones/${habitacionId}/estado`).send({ estado });
  const estado = async () =>
    (await prisma.habitacion.findUniqueOrThrow({ where: { id: habitacionId } })).estado;
  const disponibles = async () =>
    (
      await http()
        .get('/habitaciones/disponibles')
        .query({ desde: '2030-03-10', hasta: '2030-03-12' })
        .expect(200)
    ).body.map((h: { id: string }) => h.id);

  describe('ciclo de limpieza (R25)', () => {
    it('tras el check-out no se entrega hasta marcarla lista', async () => {
      // Sale un huésped el 3 y llega otro ese mismo día.
      const primera = await reservar('2030-01-01', '2030-01-03').expect(201);
      const segunda = await reservar('2030-01-03', '2030-01-05').expect(201);
      await http()
        .post(`/reservas/${primera.body.id}/check-in`)
        .send({ nacionalidad: 'CO', procedencia: 'Bogotá', motivoViaje: 'turismo' })
        .expect(201);
      reloj.fijar('2030-01-03T11:00:00-05:00');
      await http()
        .post(`/reservas/${primera.body.id}/check-out`)
        .send({ medioPago: 'efectivo' })
        .expect(201);
      expect(await estado()).toBe('en_limpieza');

      reloj.fijar('2030-01-03T15:00:00-05:00');
      const rechazo = await http()
        .post(`/reservas/${segunda.body.id}/check-in`)
        .send({ nacionalidad: 'CO', procedencia: 'Bogotá', motivoViaje: 'turismo' })
        .expect(400);
      expect(rechazo.body.message).toMatch(/en limpieza/);

      await cambiarEstado('libre', comoRecepcionista).expect(200);
      await http()
        .post(`/reservas/${segunda.body.id}/check-in`)
        .send({ nacionalidad: 'CO', procedencia: 'Bogotá', motivoViaje: 'turismo' })
        .expect(201);
      expect(await estado()).toBe('ocupada');
    });

    it('no permite poner a mano "ocupada" ni "en_limpieza"', async () => {
      await cambiarEstado('ocupada').expect(400);
      await cambiarEstado('en_limpieza').expect(400);
    });

    it('no permite liberar a mano una habitación con huésped alojado', async () => {
      const { body } = await reservar('2030-01-01', '2030-01-03').expect(201);
      await http()
        .post(`/reservas/${body.id}/check-in`)
        .send({ nacionalidad: 'CO', procedencia: 'Bogotá', motivoViaje: 'turismo' })
        .expect(201);

      const res = await cambiarEstado('libre').expect(400);
      expect(res.body.message).toMatch(/check-out/);
      await cambiarEstado('fuera_servicio').expect(400);
    });
  });

  describe('fuera de servicio (R26)', () => {
    it('sale de la disponibilidad y vuelve al reactivarla', async () => {
      expect(await disponibles()).toEqual([habitacionId]);

      await cambiarEstado('fuera_servicio').expect(200);
      expect(await disponibles()).toEqual([]);

      await cambiarEstado('libre').expect(200);
      expect(await disponibles()).toEqual([habitacionId]);
    });

    it('no admite reservas nuevas mientras está fuera de servicio', async () => {
      await cambiarEstado('fuera_servicio').expect(200);

      const res = await reservar('2030-03-10', '2030-03-12').expect(400);
      expect(res.body.message).toMatch(/fuera de servicio/);
    });

    it('avisa cuántas reservas futuras hay que reubicar', async () => {
      await reservar('2030-03-10', '2030-03-12').expect(201);
      await reservar('2030-04-10', '2030-04-12').expect(201);

      const res = await cambiarEstado('fuera_servicio').expect(200);
      expect(res.body.estado).toBe('fuera_servicio');
      expect(res.body.reservasAfectadas).toBe(2);
    });

    it('el panel la descuenta de la ocupación y cuenta las que están por limpiar', async () => {
      const otra = await crearHabitacion(prisma, { numero: '102' });
      await prisma.habitacion.update({ where: { id: otra.id }, data: { estado: 'en_limpieza' } });
      await cambiarEstado('fuera_servicio').expect(200);

      const { ocupacion, habitaciones } = (await http().get('/panel/hoy').expect(200)).body;
      expect(ocupacion.totalHabitaciones).toBe(1); // solo la 102 está en servicio
      expect(habitaciones).toEqual({ porLimpiar: 1, fueraDeServicio: 1 });
    });
  });

  it('responde 404 para una habitación inexistente', async () => {
    await http().patch('/habitaciones/no-existe/estado').send({ estado: 'libre' }).expect(404);
  });
});
