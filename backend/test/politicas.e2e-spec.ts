import { INestApplication } from '@nestjs/common';
import type TestAgent from 'supertest/lib/agent';
import { PrismaService } from '../src/prisma/prisma.service';
import { RelojFalso, crearApp, crearHabitacion, cuerpoReserva, reiniciar } from './utilidades';

const conCedula = (habitacionId: string, entrada: string, salida: string) => ({
  ...cuerpoReserva(habitacionId, entrada, salida),
  huesped: { nombre: 'Con cédula', tipoDocumento: 'CC', documento: '777' },
});

// Cada hotel ajusta sus reglas desde la Gerencia. Aplican a las reservas
// nuevas: las existentes conservan su precio y su política pactados (R5).
// Habitación de $80.000 (temporada baja en marzo de 2030); "hoy": 1 ene 2030.
describe('Políticas del hotel', () => {
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

  it('el hotel nace con las políticas por defecto y su administrador las ajusta', async () => {
    const { body: antes } = await http().get('/hotel').expect(200);
    expect(antes.politicas).toMatchObject({
      horasCancelacionGratuita: 48,
      nochesPenalidad: 1,
      ivaPorcentaje: 19,
    });

    const { body } = await http()
      .patch('/hotel/politicas')
      .send({
        horasCancelacionGratuita: 24,
        multiplicadorTemporada: { baja: 1, media: 1.2, alta: 1.5 },
      })
      .expect(200);
    // Lo que no se envía se conserva.
    expect(body.politicas).toMatchObject({
      horasCancelacionGratuita: 24,
      nochesPenalidad: 1,
      multiplicadorTemporada: { baja: 1, media: 1.2, alta: 1.5 },
    });
  });

  it('valida los rangos y solo el administrador cambia las reglas', async () => {
    await http().patch('/hotel/politicas').send({ ivaPorcentaje: 50 }).expect(400);
    await http().patch('/hotel/politicas').send({ nochesPenalidad: 4 }).expect(400);
    await http().patch('/hotel/politicas').send({ mediosPago: [] }).expect(400);
    await http()
      .patch('/hotel/politicas')
      .send({ mediosPago: ['bitcoin'] })
      .expect(400);
    await http().patch('/hotel/politicas').send({ horaCheckIn: 24 }).expect(400);
    await comoRecepcionista.patch('/hotel/politicas').send({ ivaPorcentaje: 10 }).expect(403);
  });

  it('el IVA del hotel aplica a las reservas nuevas, no a las ya pactadas', async () => {
    const pactada = await http()
      .post('/reservas')
      .send(conCedula(habitacionId, '2030-03-10', '2030-03-11'))
      .expect(201);
    expect(pactada.body.valorAlojamiento).toBe('95200'); // 80.000 + IVA 19 %

    await http().patch('/hotel/politicas').send({ ivaPorcentaje: 8 }).expect(200);
    const nueva = await http()
      .post('/reservas')
      .send(conCedula(habitacionId, '2030-03-12', '2030-03-13'))
      .expect(201);
    expect(nueva.body.valorAlojamiento).toBe('86400'); // 80.000 + IVA 8 %

    const { body } = await http().get('/reservas').expect(200);
    const intacta = body.datos.find((r: { id: string }) => r.id === pactada.body.id);
    expect(intacta.valorAlojamiento).toBe('95200');
  });

  it('un hotel puede no aplicar la exención de IVA con pasaporte', async () => {
    await http().patch('/hotel/politicas').send({ exencionIvaPasaporte: false }).expect(200);
    const res = await http()
      .post('/reservas')
      .send(cuerpoReserva(habitacionId, '2030-03-10', '2030-03-11')) // con pasaporte
      .expect(201);
    expect(res.body.valorAlojamiento).toBe('95200');
  });

  it('la política de cancelación queda pactada al reservar', async () => {
    // Reservada con la política por defecto: gratis hasta 48 h antes, 1 noche.
    const conPoliticaVieja = await http()
      .post('/reservas')
      .send(cuerpoReserva(habitacionId, '2030-03-10', '2030-03-13'))
      .expect(201);

    // El hotel endurece su política: 72 h y 2 noches de penalidad.
    await http()
      .patch('/hotel/politicas')
      .send({ horasCancelacionGratuita: 72, nochesPenalidad: 2 })
      .expect(200);
    const conPoliticaNueva = await http()
      .post('/reservas')
      .send(cuerpoReserva(habitacionId, '2030-03-20', '2030-03-23'))
      .expect(201);
    expect(conPoliticaNueva.body.cancelacionGratuitaHasta).toBe('2030-03-17T20:00:00.000Z'); // 17 mar, 3 p. m.

    // 60 h antes de cada llegada: la vieja aún cancela gratis; la nueva paga 2 noches.
    reloj.fijar('2030-03-08T03:00:00-05:00');
    const vieja = await http().post(`/reservas/${conPoliticaVieja.body.id}/cancelar`).expect(201);
    expect(vieja.body.total).toBe('0');

    reloj.fijar('2030-03-18T03:00:00-05:00');
    const nueva = await http().post(`/reservas/${conPoliticaNueva.body.id}/cancelar`).expect(201);
    expect(nueva.body.total).toBe('160000'); // 2 noches × $80.000 (pasaporte: sin IVA)
  });

  it('sin noches de penalidad, cancelar tarde no cuesta', async () => {
    await http().patch('/hotel/politicas').send({ nochesPenalidad: 0 }).expect(200);
    const res = await http()
      .post('/reservas')
      .send(cuerpoReserva(habitacionId, '2030-03-10', '2030-03-12'))
      .expect(201);
    reloj.fijar('2030-03-10T09:00:00-05:00');
    const cancelada = await http().post(`/reservas/${res.body.id}/cancelar`).expect(201);
    expect(cancelada.body.total).toBe('0');
  });

  it('el check-out solo acepta los medios de pago del hotel', async () => {
    await http()
      .patch('/hotel/politicas')
      .send({ mediosPago: ['efectivo'] })
      .expect(200);
    const res = await http()
      .post('/reservas')
      .send(cuerpoReserva(habitacionId, '2030-03-10', '2030-03-12'))
      .expect(201);
    reloj.fijar('2030-03-10T15:00:00-05:00');
    await http()
      .post(`/reservas/${res.body.id}/check-in`)
      .send({ nacionalidad: 'CO', procedencia: 'Bogotá', motivoViaje: 'turismo' })
      .expect(201);

    reloj.fijar('2030-03-12T10:00:00-05:00');
    const rechazo = await http()
      .post(`/reservas/${res.body.id}/check-out`)
      .send({ medioPago: 'tarjeta' })
      .expect(400);
    expect(rechazo.body.message).toMatch(/no recibe pagos por tarjeta/);
    await http()
      .post(`/reservas/${res.body.id}/check-out`)
      .send({ medioPago: 'efectivo' })
      .expect(201);
  });

  it('los multiplicadores del hotel cambian el precio de temporada', async () => {
    await http()
      .patch('/hotel/politicas')
      .send({ multiplicadorTemporada: { baja: 1, media: 1.15, alta: 2 } })
      .expect(200);
    // 2 ene 2030: temporada alta (fin de año) → 80.000 × 2.
    const { body } = await http()
      .get('/habitaciones/disponibles?desde=2030-01-02&hasta=2030-01-03')
      .expect(200);
    expect(body[0].cotizacion.noches[0]).toMatchObject({ temporada: 'alta', tarifa: 160000 });
  });
});
