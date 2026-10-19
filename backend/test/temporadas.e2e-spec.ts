import { INestApplication } from '@nestjs/common';
import type TestAgent from 'supertest/lib/agent';
import { PrismaService } from '../src/prisma/prisma.service';
import { RelojFalso, crearApp, crearHabitacion, reiniciar } from './utilidades';

// Temporadas propias del hotel (R13–R15). Habitación de $80.000; "hoy": 1 ene 2030.
describe('Temporadas del hotel', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reloj: RelojFalso;
  let http: () => TestAgent; // admin
  let comoRecepcionista: TestAgent;
  let comoOtroHotel: TestAgent;

  const cotizar = async (desde: string, hasta: string) => {
    const { body } = await http()
      .get(`/habitaciones/disponibles?desde=${desde}&hasta=${hasta}`)
      .expect(200);
    return body[0].cotizacion.noches as { fecha: string; temporada: string; motivo: string }[];
  };

  beforeAll(async () => {
    ({ app, prisma, reloj, http, comoRecepcionista, comoOtroHotel } = await crearApp());
  });

  beforeEach(async () => {
    await reiniciar(prisma, reloj);
    await crearHabitacion(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('el hotel nace con el calendario sugerido para Colombia', async () => {
    const { body } = await comoRecepcionista.get('/temporadas').expect(200);
    expect(body.map((t: { nombre: string }) => t.nombre).sort()).toEqual([
      'Temporada de fin de año',
      'Vacaciones de mitad de año',
    ]);
  });

  it('una temporada propia cambia el precio de las reservas nuevas', async () => {
    expect((await cotizar('2030-08-10', '2030-08-11'))[0].temporada).toBe('baja');

    await http()
      .post('/temporadas')
      .send({ nombre: 'Festival del Mar', tipo: 'alta', desde: 805, hasta: 815 })
      .expect(201);

    const [noche] = await cotizar('2030-08-10', '2030-08-11');
    expect(noche).toMatchObject({ temporada: 'alta', motivo: 'Festival del Mar', tarifa: 104000 });
  });

  it('se puede desactivar o borrar una temporada', async () => {
    const { body } = await http().get('/temporadas').expect(200);
    const finDeAnio = body.find((t: { nombre: string }) => t.nombre === 'Temporada de fin de año');

    expect((await cotizar('2030-01-09', '2030-01-10'))[0].temporada).toBe('alta');
    await http().patch(`/temporadas/${finDeAnio.id}`).send({ activa: false }).expect(200);
    expect((await cotizar('2030-01-09', '2030-01-10'))[0].temporada).toBe('baja');

    await http().delete(`/temporadas/${finDeAnio.id}`).expect(204);
    const despues = await http().get('/temporadas').expect(200);
    expect(despues.body).toHaveLength(1);
  });

  it('los puentes festivos se pueden apagar', async () => {
    // 2030-01-04 (viernes) es noche de puente: Reyes Magos cae el lunes 7.
    // Se quita fin de año para que no lo tape.
    const { body } = await http().get('/temporadas').expect(200);
    for (const t of body) await http().delete(`/temporadas/${t.id}`).expect(204);
    expect((await cotizar('2030-01-04', '2030-01-05'))[0].temporada).toBe('media');

    await http().patch('/hotel/politicas').send({ puentesFestivosMedia: false }).expect(200);
    expect((await cotizar('2030-01-04', '2030-01-05'))[0].temporada).toBe('baja');
  });

  it('el calendario del año muestra los periodos del hotel', async () => {
    await http()
      .post('/temporadas')
      .send({ nombre: 'Festival del Mar', tipo: 'alta', desde: 805, hasta: 815 })
      .expect(201);
    const { body } = await http().get('/tarifas/temporadas?anio=2030').expect(200);
    expect(body.periodos.some((p: { motivo: string }) => p.motivo === 'Festival del Mar')).toBe(
      true,
    );
  });

  it('valida las fechas, el tipo y los permisos', async () => {
    await http()
      .post('/temporadas')
      .send({ nombre: 'X', tipo: 'alta', desde: 230, hasta: 301 })
      .expect(400); // 30 feb
    await http()
      .post('/temporadas')
      .send({ nombre: 'X', tipo: 'baja', desde: 101, hasta: 102 })
      .expect(400);
    await http()
      .post('/temporadas')
      .send({ nombre: 'Bisiesto', tipo: 'media', desde: 229, hasta: 229 })
      .expect(201);
    await comoRecepcionista
      .post('/temporadas')
      .send({ nombre: 'X', tipo: 'alta', desde: 101, hasta: 102 })
      .expect(403);

    // Otro hotel no ve ni toca las temporadas de este.
    const { body } = await http().get('/temporadas').expect(200);
    await comoOtroHotel.patch(`/temporadas/${body[0].id}`).send({ activa: false }).expect(404);
    await comoOtroHotel.delete(`/temporadas/${body[0].id}`).expect(404);
  });
});
