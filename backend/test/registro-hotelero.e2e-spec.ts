import { INestApplication } from '@nestjs/common';
import type TestAgent from 'supertest/lib/agent';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  RelojFalso,
  crearApp,
  crearHabitacion,
  cuerpoCheckIn,
  ocupanteDePrueba,
  reiniciar,
} from './utilidades';

// R19: el check-in exige los datos del registro hotelero y el sistema arma el
// registro del día, con cada ocupante (extranjeros marcados para el reporte a Migración).
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

  // El titular de `reservar(numero, documento, tipo)` con los datos indicados.
  const titular = (documento: string, cambios: object = {}, tipoDocumento = 'CC') =>
    ocupanteDePrueba({ documento, tipoDocumento, ...cambios });

  it('exige el motivo del viaje y códigos de país válidos', async () => {
    const id = await reservar('101', '111');

    await checkIn(id, {}).expect(400);
    await checkIn(id, cuerpoCheckIn([titular('111', { nacionalidad: 'Colombia' })])).expect(400);
    await checkIn(id, cuerpoCheckIn([titular('111', { ciudadProcedencia: '' })])).expect(400);
    await checkIn(id, cuerpoCheckIn([titular('111')], 'parranda')).expect(400);
    await checkIn(id, { motivoViaje: 'turismo', ocupantes: [] }).expect(400);
    // Nada de lo anterior hizo el check-in.
    expect((await prisma.reserva.findUniqueOrThrow({ where: { id } })).estado).toBe('confirmada');
  });

  it('guarda la nacionalidad en el huésped y procedencia y motivo en la estadía', async () => {
    const id = await reservar('101', 'P123', 'PASAPORTE');

    await checkIn(
      id,
      cuerpoCheckIn(
        [
          titular(
            'P123',
            { nacionalidad: ' ve ', ciudadProcedencia: 'Caracas', paisProcedencia: 'VE' },
            'PASAPORTE',
          ),
        ],
        'negocios',
      ),
    ).expect(201);

    const reserva = await prisma.reserva.findUniqueOrThrow({
      where: { id },
      include: { huesped: true, ocupantes: true },
    });
    expect(reserva.huesped.nacionalidad).toBe('VE');
    expect(reserva.motivoViaje).toBe('negocios');
    expect([reserva.ocupantes[0].paisProcedencia, reserva.ocupantes[0].ciudadProcedencia]).toEqual([
      'VE',
      'Caracas',
    ]);
  });

  it('arma el registro del día y marca a los extranjeros', async () => {
    const colombiano = await reservar('101', '111');
    const extranjero = await reservar('102', 'P123', 'PASAPORTE');
    await reservar('103', '333'); // confirmada sin check-in: no aparece

    await checkIn(
      colombiano,
      cuerpoCheckIn([titular('111', { ciudadProcedencia: 'Medellín' })]),
    ).expect(201);
    await checkIn(
      extranjero,
      cuerpoCheckIn(
        [
          titular(
            'P123',
            { nacionalidad: 'US', paisProcedencia: 'US', ciudadProcedencia: 'Miami' },
            'PASAPORTE',
          ),
        ],
        'eventos',
      ),
    ).expect(201);

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
    expect(body.registros[1].ocupantes).toEqual([
      expect.objectContaining({ titular: true, extranjero: true, menor: false, documento: 'P123' }),
    ]);
  });

  it('consulta el registro de otro día', async () => {
    const id = await reservar('101', '111');
    await checkIn(id, cuerpoCheckIn([titular('111')], 'salud')).expect(201);

    const otroDia = await http()
      .get('/reservas/registro-hotelero')
      .query({ fecha: '2030-01-02' })
      .expect(200);
    expect(otroDia.body.registros).toEqual([]);
    await http().get('/reservas/registro-hotelero').query({ fecha: 'ayer' }).expect(400);
  });

  it('la nacionalidad queda registrada para la próxima visita', async () => {
    const id = await reservar('101', '111');
    await checkIn(id, cuerpoCheckIn([titular('111', { nacionalidad: 'EC' })])).expect(201);

    const huesped = await http().get('/huespedes/documento/CC/111').expect(200);
    expect(huesped.body.nacionalidad).toBe('EC');
  });
});
