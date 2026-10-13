import { INestApplication } from '@nestjs/common';
import type TestAgent from 'supertest/lib/agent';
import { PrismaService } from '../src/prisma/prisma.service';
import { RelojFalso, crearApp, crearHabitacion, reiniciar } from './utilidades';

// R19: el check-in exige los datos del registro hotelero y el sistema arma el
// registro del día (extranjeros marcados para el reporte a Migración).
describe('Registro hotelero (R19)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reloj: RelojFalso;
  let http: () => TestAgent;

  beforeAll(async () => {
    ({ app, prisma, reloj, http } = await crearApp());
  });

  beforeEach(async () => {
    await reiniciar(prisma, reloj); // hoy: 2030-01-01
  });

  afterAll(async () => {
    await app.close();
  });

  const reservar = async (numero: string, documento: string, tipoDocumento = 'CC') => {
    const habitacion = await crearHabitacion(prisma, { numero });
    const res = await http()
      .post('/reservas')
      .send({
        habitacionId: habitacion.id,
        huesped: { nombre: `Huésped ${documento}`, tipoDocumento, documento },
        fechaEntrada: '2030-01-01',
        fechaSalida: '2030-01-03',
      })
      .expect(201);
    return res.body.id as string;
  };

  const checkIn = (id: string, registro: object) =>
    http().post(`/reservas/${id}/check-in`).send(registro);

  it('exige nacionalidad, procedencia y motivo del viaje', async () => {
    const id = await reservar('101', '111');

    await checkIn(id, {}).expect(400);
    await checkIn(id, {
      nacionalidad: 'Colombia',
      procedencia: 'Cali',
      motivoViaje: 'turismo',
    }).expect(400);
    await checkIn(id, { nacionalidad: 'CO', procedencia: '', motivoViaje: 'turismo' }).expect(400);
    await checkIn(id, { nacionalidad: 'CO', procedencia: 'Cali', motivoViaje: 'parranda' }).expect(
      400,
    );
    // Nada de lo anterior hizo el check-in.
    expect((await prisma.reserva.findUniqueOrThrow({ where: { id } })).estado).toBe('confirmada');
  });

  it('guarda la nacionalidad en el huésped y procedencia y motivo en la estadía', async () => {
    const id = await reservar('101', 'P123', 'PASAPORTE');

    await checkIn(id, {
      nacionalidad: ' ve ',
      procedencia: 'Caracas',
      motivoViaje: 'negocios',
    }).expect(201);

    const reserva = await prisma.reserva.findUniqueOrThrow({
      where: { id },
      include: { huesped: true },
    });
    expect(reserva.huesped.nacionalidad).toBe('VE');
    expect([reserva.procedencia, reserva.motivoViaje]).toEqual(['Caracas', 'negocios']);
  });

  it('arma el registro del día y marca a los extranjeros', async () => {
    const colombiano = await reservar('101', '111');
    const extranjero = await reservar('102', 'P123', 'PASAPORTE');
    await reservar('103', '333'); // confirmada sin check-in: no aparece

    await checkIn(colombiano, {
      nacionalidad: 'CO',
      procedencia: 'Medellín',
      motivoViaje: 'turismo',
    }).expect(201);
    await checkIn(extranjero, {
      nacionalidad: 'US',
      procedencia: 'Miami',
      motivoViaje: 'eventos',
    }).expect(201);

    const { body } = await http().get('/reservas/registro-hotelero').expect(200);

    expect(body.fecha).toBe('2030-01-01T00:00:00.000Z');
    expect(
      body.registros.map((r: { habitacion: string; nacionalidad: string; extranjero: boolean }) => [
        r.habitacion,
        r.nacionalidad,
        r.extranjero,
      ]),
    ).toEqual([
      ['101', 'CO', false],
      ['102', 'US', true],
    ]);
    expect(body.registros[1]).toMatchObject({
      tipoDocumento: 'PASAPORTE',
      documento: 'P123',
      procedencia: 'Miami',
      motivoViaje: 'eventos',
    });
  });

  it('consulta el registro de otro día', async () => {
    const id = await reservar('101', '111');
    await checkIn(id, { nacionalidad: 'CO', procedencia: 'Cali', motivoViaje: 'salud' }).expect(
      201,
    );

    const otroDia = await http()
      .get('/reservas/registro-hotelero')
      .query({ fecha: '2030-01-02' })
      .expect(200);
    expect(otroDia.body.registros).toEqual([]);
    await http().get('/reservas/registro-hotelero').query({ fecha: 'ayer' }).expect(400);
  });

  it('la nacionalidad queda registrada para la próxima visita', async () => {
    const id = await reservar('101', '111');
    await checkIn(id, { nacionalidad: 'EC', procedencia: 'Quito', motivoViaje: 'turismo' }).expect(
      201,
    );

    const huesped = await http().get('/huespedes/documento/CC/111').expect(200);
    expect(huesped.body.nacionalidad).toBe('EC');
  });
});
