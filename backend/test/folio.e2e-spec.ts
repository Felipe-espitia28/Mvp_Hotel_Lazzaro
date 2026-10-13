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

// Folio (R20–R23): consumos cargados a la habitación durante la estadía y
// liquidación en el check-out. Estadía de prueba: 10→12 mar 2030 (baja),
// $80.000 × 2 noches = $160.000 de alojamiento (huésped con pasaporte, sin IVA).
describe('Folio y cargos', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reloj: RelojFalso;
  let http: () => TestAgent; // admin
  let comoRecepcionista: TestAgent;
  let reservaId: string;

  beforeAll(async () => {
    ({ app, prisma, reloj, http, comoRecepcionista } = await crearApp());
  });

  beforeEach(async () => {
    await reiniciar(prisma, reloj);
    const habitacion = await crearHabitacion(prisma);
    const res = await http()
      .post('/reservas')
      .send(cuerpoReserva(habitacion.id, '2030-03-10', '2030-03-12'))
      .expect(201);
    reservaId = res.body.id;
    reloj.fijar('2030-03-10T15:00:00-05:00');
  });

  afterAll(async () => {
    await app.close();
  });

  const MINIBAR = {
    categoria: 'minibar',
    concepto: 'Agua 600 ml',
    cantidad: 2,
    valorUnitario: 6000,
  };
  const CENA = { categoria: 'restaurante', concepto: 'Cena', cantidad: 1, valorUnitario: 68000 };

  const checkIn = () => http().post(`/reservas/${reservaId}/check-in`).expect(201);
  // Mañana del día de salida pactado (12 mar): salida normal, sin R24.
  const llegaElDiaDeSalida = () => reloj.fijar('2030-03-12T11:00:00-05:00');
  const cargar = (cargo: object, cliente: TestAgent = http()) =>
    cliente.post(`/reservas/${reservaId}/cargos`).send(cargo);
  const folio = async () => (await http().get(`/reservas/${reservaId}/folio`).expect(200)).body;
  const checkOut = (cuerpo: object = { medioPago: 'tarjeta' }) =>
    http().post(`/reservas/${reservaId}/check-out`).send(cuerpo);

  it('suma los consumos al folio de una estadía activa', async () => {
    await checkIn();
    await cargar(MINIBAR).expect(201);
    const res = await cargar(CENA, comoRecepcionista).expect(201);

    expect(Number(res.body.alojamiento)).toBe(160000);
    expect(Number(res.body.consumos)).toBe(12000 + 68000);
    expect(Number(res.body.total)).toBe(240000);
    expect(res.body.cargos.map((c: { concepto: string }) => c.concepto)).toEqual([
      'Agua 600 ml',
      'Cena',
    ]);
    expect(res.body.cargos[1].usuario.nombre).toBe(USUARIOS_PRUEBA.recepcionista.nombre);
  });

  it('no admite cargos antes del check-in ni después del check-out (R21)', async () => {
    const antes = await cargar(MINIBAR).expect(400);
    expect(antes.body.message).toMatch(/estadía activa/);

    await checkIn();
    await checkOut().expect(201);
    await cargar(MINIBAR).expect(400);
  });

  it('anular un cargo lo saca del total sin borrarlo', async () => {
    await checkIn();
    await cargar(MINIBAR).expect(201);
    const { body } = await cargar(CENA).expect(201);
    const cena = body.cargos[1];

    const res = await http()
      .post(`/reservas/${reservaId}/cargos/${cena.id}/anular`)
      .send({ motivo: 'Cargado a la habitación equivocada' })
      .expect(201);

    expect(Number(res.body.consumos)).toBe(12000);
    expect(res.body.cargos).toHaveLength(2);
    expect(res.body.cargos[1]).toMatchObject({
      anulado: true,
      motivoAnulacion: 'Cargado a la habitación equivocada',
    });

    // Anularlo de nuevo, sin motivo o con un id ajeno: rechazado.
    await http()
      .post(`/reservas/${reservaId}/cargos/${cena.id}/anular`)
      .send({ motivo: 'x' })
      .expect(400);
    await http().post(`/reservas/${reservaId}/cargos/${cena.id}/anular`).send({}).expect(400);
    await http()
      .post(`/reservas/${reservaId}/cargos/no-existe/anular`)
      .send({ motivo: 'x' })
      .expect(404);
  });

  it('el check-out liquida alojamiento + consumos vigentes y guarda el medio de pago (R23)', async () => {
    await checkIn();
    await cargar(MINIBAR).expect(201);
    const { body } = await cargar(CENA).expect(201);
    await http()
      .post(`/reservas/${reservaId}/cargos/${body.cargos[1].id}/anular`)
      .send({ motivo: 'Error' })
      .expect(201);

    llegaElDiaDeSalida();
    const res = await checkOut({ medioPago: 'transferencia' }).expect(201);

    expect(res.body.estado).toBe('cerrada');
    expect(Number(res.body.total)).toBe(160000 + 12000);
    expect(res.body.medioPago).toBe('transferencia');
    const final = await folio();
    expect(Number(final.total)).toBe(172000);
  });

  it('exige un medio de pago válido para el check-out', async () => {
    await checkIn();
    await checkOut({}).expect(400);
    await checkOut({ medioPago: 'trueque' }).expect(400);
    await checkOut({ medioPago: 'efectivo' }).expect(201);
  });

  it('rechaza cargos con datos inválidos', async () => {
    await checkIn();
    await cargar({ ...MINIBAR, categoria: 'spa' }).expect(400);
    await cargar({ ...MINIBAR, cantidad: 0 }).expect(400);
    await cargar({ ...MINIBAR, valorUnitario: -1 }).expect(400);
    await cargar({ ...MINIBAR, concepto: '' }).expect(400);
  });

  it('deja cada movimiento del folio en la auditoría', async () => {
    await checkIn();
    const { body } = await cargar(MINIBAR).expect(201);
    await http()
      .post(`/reservas/${reservaId}/cargos/${body.cargos[0].id}/anular`)
      .send({ motivo: 'No lo consumió' })
      .expect(201);
    llegaElDiaDeSalida();
    await checkOut({ medioPago: 'efectivo' }).expect(201);

    const historial = (await http().get(`/reservas/${reservaId}/historial`).expect(200)).body;
    expect(historial.map((e: { tipo: string; detalle: string }) => [e.tipo, e.detalle])).toEqual([
      ['creada', null],
      ['check_in', null],
      ['cargo_agregado', 'Agua 600 ml × 2 · $12.000'],
      ['cargo_anulado', 'Agua 600 ml ($12.000) · No lo consumió'],
      ['check_out', 'Total $160.000 · efectivo'],
    ]);
  });

  it('los ingresos del mes en el panel incluyen los consumos liquidados', async () => {
    await checkIn();
    await cargar(CENA).expect(201);
    reloj.fijar('2030-03-12T11:00:00-05:00');
    await checkOut().expect(201);

    const { ingresosDelMes } = (await http().get('/panel/hoy').expect(200)).body;
    expect(Number(ingresosDelMes.alojamiento)).toBe(160000);
    expect(Number(ingresosDelMes.consumos)).toBe(68000);
    expect(Number(ingresosDelMes.total)).toBe(228000);
  });

  it('un cargo concurrente con el check-out nunca queda fuera de la liquidación', async () => {
    await checkIn();
    llegaElDiaDeSalida();
    // Salen a la vez: el bloqueo de la reserva los ordena. Los cargos que llegan
    // antes del cierre entran a la cuenta; los que llegan después se rechazan.
    const respuestas = await Promise.all([
      cargar(CENA),
      cargar(MINIBAR),
      checkOut(),
      cargar(CENA),
      cargar(MINIBAR),
    ]);
    expect(respuestas[2].status).toBe(201);
    expect(respuestas.every((r) => r.status === 201 || r.status === 400)).toBe(true);

    const reserva = await prisma.reserva.findUniqueOrThrow({
      where: { id: reservaId },
      include: { cargos: true },
    });
    const consumos = reserva.cargos.reduce((suma, c) => suma + Number(c.total), 0);
    expect(Number(reserva.total)).toBe(160000 + consumos);
  });

  it('responde 404 para el folio de una reserva inexistente', async () => {
    await http().get('/reservas/no-existe/folio').expect(404);
    await cargar(MINIBAR).expect(400); // reserva confirmada (sin check-in)
  });
});
