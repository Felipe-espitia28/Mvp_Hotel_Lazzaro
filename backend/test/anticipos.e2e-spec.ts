import { INestApplication } from '@nestjs/common';
import type TestAgent from 'supertest/lib/agent';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  RelojFalso,
  crearApp,
  crearHabitacion,
  cuerpoCheckIn,
  cuerpoReserva,
  reiniciar,
} from './utilidades';

// A-2: anticipos. Estadía de prueba: 10→12 mar 2030 (baja), $80.000 × 2
// noches = $160.000 (huésped con pasaporte, sin IVA). Por defecto el hotel
// sugiere un anticipo del 30 % ($48.000) y cobra 1 noche de penalidad.
describe('Anticipos (A-2)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reloj: RelojFalso;
  let http: () => TestAgent;
  let reservaId: string;

  beforeAll(async () => {
    ({ app, prisma, reloj, http } = await crearApp());
  });

  // Reserva hecha el 1 de marzo para el 10–12 de marzo.
  const reservar = async (numero = '101', entrada = '2030-03-10', salida = '2030-03-12') => {
    reloj.fijar('2030-03-01T10:00:00-05:00');
    const habitacion = await crearHabitacion(prisma, { numero });
    const { body } = await http()
      .post('/reservas')
      .send(cuerpoReserva(habitacion.id, entrada, salida))
      .expect(201);
    return body;
  };

  beforeEach(async () => {
    await reiniciar(prisma, reloj);
    reservaId = (await reservar()).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const pagar = (tipo: string, monto: number, id = reservaId) =>
    http().post(`/reservas/${id}/pagos`).send({ tipo, medio: 'transferencia', monto });
  const folio = async (id = reservaId) =>
    (await http().get(`/reservas/${id}/folio`).expect(200)).body;

  it('sugiere el 30 % del total, al peso; cambiar el % no altera las reservas existentes', async () => {
    expect(
      Number(
        (await prisma.reserva.findUniqueOrThrow({ where: { id: reservaId } })).anticipoSugerido,
      ),
    ).toBe(48000);

    await http().patch('/hotel/politicas').send({ anticipoPorcentaje: 33 }).expect(200);

    expect(
      Number(
        (await prisma.reserva.findUniqueOrThrow({ where: { id: reservaId } })).anticipoSugerido,
      ),
    ).toBe(48000);
    // 33 % de 160.000 = 52.800.
    expect(Number((await reservar('102')).anticipoSugerido)).toBe(52800);
  });

  it('el anticipo de una reserva confirmada se descuenta en el check-out', async () => {
    const { body } = await pagar('anticipo', 48000).expect(201);
    expect(body.saldo).toBe(112000);

    reloj.fijar('2030-03-10T15:00:00-05:00');
    await http().post(`/reservas/${reservaId}/check-in`).send(cuerpoCheckIn()).expect(201);
    reloj.fijar('2030-03-12T10:00:00-05:00');
    await http()
      .post(`/reservas/${reservaId}/check-out`)
      .send({ pagos: [{ medio: 'tarjeta', monto: 112000 }] })
      .expect(201);

    expect((await folio()).saldo).toBe(0);
    const evento = await prisma.eventoReserva.findFirstOrThrow({
      where: { reservaId, tipo: 'pago_registrado' },
    });
    expect(evento.detalle).toBe('Anticipo $48.000 · transferencia');
  });

  it('antes de llegar es un anticipo; con la estadía en curso, un abono', async () => {
    await pagar('abono', 10000).expect(400);
    reloj.fijar('2030-03-10T15:00:00-05:00');
    await http().post(`/reservas/${reservaId}/check-in`).send(cuerpoCheckIn()).expect(201);
    await pagar('anticipo', 10000).expect(400);
    await pagar('abono', 10000).expect(201);
  });

  it('cancelación tardía: el anticipo cubre la penalidad y se devuelve lo que sobra', async () => {
    await pagar('anticipo', 100000).expect(201);
    reloj.fijar('2030-03-09T10:00:00-05:00'); // menos de 48 h antes

    const { body } = await http().post(`/reservas/${reservaId}/cancelar`).expect(201);

    // Penalidad: la primera noche ($80.000).
    expect(body).toMatchObject({ penalidad: 80000, anticipos: 100000, aDevolver: 20000 });
    const evento = await prisma.eventoReserva.findFirstOrThrow({
      where: { reservaId, tipo: 'cancelada' },
    });
    expect(evento.detalle).toBe('Penalidad $80.000 · anticipo $100.000 · a devolver $20.000');

    await pagar('reembolso', 20000).expect(201);
    expect((await folio()).saldo).toBe(0);
    expect((await http().get('/saldos-a-favor').expect(200)).body).toEqual([]);
  });

  it('cancelación gratuita: el anticipo se devuelve completo', async () => {
    await pagar('anticipo', 48000).expect(201);
    reloj.fijar('2030-03-05T10:00:00-05:00');

    const { body } = await http().post(`/reservas/${reservaId}/cancelar`).expect(201);

    expect(body).toMatchObject({ penalidad: 0, aDevolver: 48000 });
    const saldos = await http().get('/saldos-a-favor').expect(200);
    expect(saldos.body).toEqual([expect.objectContaining({ reservaId, saldo: -48000 })]);
  });

  it('no-show: el anticipo se retiene hasta la penalidad y el excedente queda a favor', async () => {
    await pagar('anticipo', 100000).expect(201);
    reloj.fijar('2030-03-11T13:00:00-05:00'); // pasó el límite de llegada

    await http().post('/reservas/no-shows/procesar').expect(200);

    const saldos = await http().get('/saldos-a-favor').expect(200);
    expect(saldos.body).toEqual([
      expect.objectContaining({ reservaId, estado: 'no_show', saldo: -20000 }),
    ]);
    expect((await http().get('/cuentas-por-cobrar').expect(200)).body).toEqual([]);
    const evento = await prisma.eventoReserva.findFirstOrThrow({
      where: { reservaId, tipo: 'no_show' },
    });
    expect(evento.detalle).toBe('Penalidad $80.000 · anticipo $100.000 · a favor $20.000');
  });

  it('marca "anticipo pendiente" solo si el hotel lo exige y la llegada es en 7 días o menos', async () => {
    const lejana = (await reservar('102', '2030-03-20', '2030-03-22')).id;
    const marcas = async () => {
      reloj.fijar('2030-03-05T10:00:00-05:00');
      const { body } = await http().get('/reservas').expect(200);
      return Object.fromEntries(
        body.datos.map((r: { id: string; anticipoPendiente: boolean }) => [
          r.id,
          r.anticipoPendiente,
        ]),
      );
    };

    expect(await marcas()).toEqual({ [reservaId]: false, [lejana]: false });
    await http().patch('/hotel/politicas').send({ anticipoObligatorio: true }).expect(200);
    expect(await marcas()).toEqual({ [reservaId]: true, [lejana]: false });

    await pagar('anticipo', 48000).expect(201);
    expect((await marcas())[reservaId]).toBe(false);
  });
});
