import { INestApplication } from '@nestjs/common';
import type TestAgent from 'supertest/lib/agent';
import { PrismaService } from '../src/prisma/prisma.service';
import { HOTEL_ANTIGUO, probarMigracion } from './migraciones';
import {
  RelojFalso,
  crearApp,
  crearHabitacion,
  cuerpoCheckIn,
  cuerpoReserva,
  reiniciar,
} from './utilidades';

// A-1: pagos, abonos y saldo del folio. El saldo nunca se guarda: se calcula
// del libro de pagos. Estadía de prueba: 10→12 mar 2030 (baja), $80.000 × 2
// noches = $160.000 de alojamiento (huésped con pasaporte, sin IVA).
describe('Pagos y saldo del folio (A-1)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reloj: RelojFalso;
  let http: () => TestAgent; // admin
  let comoRecepcionista: TestAgent;
  let comoOtroHotel: TestAgent;
  let reservaId: string;

  beforeAll(async () => {
    ({ app, prisma, reloj, http, comoRecepcionista, comoOtroHotel } = await crearApp());
  });

  // Una reserva del 10 al 12 de marzo en una habitación nueva; con check-in si se pide.
  const reservar = async (numero = '101', conCheckIn = true) => {
    reloj.fijar('2030-03-01T10:00:00-05:00');
    const habitacion = await crearHabitacion(prisma, { numero });
    const { body } = await http()
      .post('/reservas')
      .send(cuerpoReserva(habitacion.id, '2030-03-10', '2030-03-12'))
      .expect(201);
    if (conCheckIn) {
      reloj.fijar('2030-03-10T15:00:00-05:00');
      await http().post(`/reservas/${body.id}/check-in`).send(cuerpoCheckIn()).expect(201);
    }
    return body.id as string;
  };

  beforeEach(async () => {
    await reiniciar(prisma, reloj);
    reservaId = await reservar();
  });

  afterAll(async () => {
    await app.close();
  });

  const abonar = (monto: number, extra: object = {}, cliente: TestAgent = http(), id = reservaId) =>
    cliente.post(`/reservas/${id}/pagos`).send({ medio: 'efectivo', monto, ...extra });
  const folio = async (id = reservaId) =>
    (await http().get(`/reservas/${id}/folio`).expect(200)).body;
  const checkOut = (cuerpo: object, cliente: TestAgent = http(), id = reservaId) =>
    cliente.post(`/reservas/${id}/check-out`).send(cuerpo);
  const elDiaDeSalida = () => reloj.fijar('2030-03-12T10:00:00-05:00');

  it('dos abonos y un cargo durante la estadía dan el saldo correcto', async () => {
    await abonar(50000).expect(201);
    reloj.fijar('2030-03-10T20:00:00-05:00');
    await http()
      .post(`/reservas/${reservaId}/cargos`)
      .send({ categoria: 'minibar', concepto: 'Agua', cantidad: 2, valorUnitario: 6000 })
      .expect(201);
    reloj.fijar('2030-03-11T09:00:00-05:00');
    const res = await abonar(
      30000,
      { medio: 'tarjeta', referencia: 'VOUCHER-1' },
      comoRecepcionista,
    ).expect(201);

    expect(res.body).toMatchObject({ debe: 172000, pagado: 80000, saldo: 92000 });
    expect(res.body.movimientos.map((m: { clase: string }) => m.clase)).toEqual([
      'pago',
      'cargo',
      'pago',
    ]);
    const eventos = await prisma.eventoReserva.findMany({
      where: { reservaId, tipo: 'pago_registrado' },
      orderBy: { fecha: 'asc' },
    });
    expect(eventos.map((e) => e.detalle)).toEqual([
      'Abono $50.000 · efectivo',
      'Abono $30.000 · tarjeta · ref. VOUCHER-1',
    ]);
  });

  it('solo acepta los medios de pago que el hotel recibe', async () => {
    await abonar(10000, { medio: 'pasarela' }).expect(400);
    await abonar(10000, { medio: 'trueque' }).expect(400);
    await abonar(-5).expect(400);
  });

  it('el check-out exige dejar el saldo en 0, y acepta varios medios', async () => {
    await abonar(60000).expect(201);
    elDiaDeSalida();

    await checkOut({ pagos: [{ medio: 'tarjeta', monto: 50000 }] }).expect(400);
    const res = await checkOut({
      pagos: [
        { medio: 'efectivo', monto: 30000 },
        { medio: 'tarjeta', monto: 70000, referencia: '4455' },
      ],
    }).expect(201);

    expect(res.body).toMatchObject({ estado: 'cerrada', saldo: 0 });
    const cuenta = await folio();
    expect(cuenta.pagos).toHaveLength(3);
    expect(cuenta.saldo).toBe(0);
    const checkOutEvento = await prisma.eventoReserva.findFirstOrThrow({
      where: { reservaId, tipo: 'check_out' },
    });
    expect(checkOutEvento.detalle).toBe(
      'Total $160.000 · Abono $30.000 · efectivo + Abono $70.000 · tarjeta · ref. 4455',
    );
  });

  it('con el atajo de un medio, paga todo lo pendiente', async () => {
    await abonar(60000).expect(201);
    elDiaDeSalida();
    await checkOut({ medioPago: 'tarjeta' }).expect(201);

    const cuenta = await folio();
    expect(
      cuenta.pagos.map((p: { medio: string; monto: string }) => [p.medio, Number(p.monto)]),
    ).toEqual([
      ['efectivo', 60000],
      ['tarjeta', 100000],
    ]);
    await checkOut({ medioPago: 'efectivo', pagos: [] }, http(), await reservar('102')).expect(400);
  });

  it('un saldo a favor se reembolsa o se deja a favor', async () => {
    await abonar(200000).expect(201);
    elDiaDeSalida();

    await checkOut({ medioPago: 'efectivo' }).expect(400);
    await checkOut({ pagos: [{ tipo: 'reembolso', medio: 'efectivo', monto: 40000 }] }).expect(201);
    expect((await folio()).saldo).toBe(0);

    const otra = await reservar('102');
    await abonar(170000, {}, http(), otra).expect(201);
    elDiaDeSalida();
    const res = await checkOut({ saldoAFavor: true }, http(), otra).expect(201);
    expect(res.body.saldo).toBe(-10000);
  });

  it('anular un abono sube el saldo; recepción no puede anular', async () => {
    const { body } = await abonar(50000).expect(201);
    const pagoId = body.pagos[0].id;

    await comoRecepcionista
      .post(`/reservas/${reservaId}/pagos/${pagoId}/anular`)
      .send({ motivo: 'Error' })
      .expect(403);
    await http().post(`/reservas/${reservaId}/pagos/${pagoId}/anular`).send({}).expect(400);
    const res = await http()
      .post(`/reservas/${reservaId}/pagos/${pagoId}/anular`)
      .send({ motivo: 'Se registró dos veces' })
      .expect(201);

    expect(res.body.saldo).toBe(160000);
    expect(res.body.pagos[0]).toMatchObject({
      anulado: true,
      motivoAnulacion: 'Se registró dos veces',
    });
    await http()
      .post(`/reservas/${reservaId}/pagos/${pagoId}/anular`)
      .send({ motivo: 'Otra vez' })
      .expect(400);
  });

  it('10 abonos simultáneos y el check-out: el saldo siempre cuadra (5 veces)', async () => {
    for (let vuelta = 1; vuelta <= 5; vuelta++) {
      const id = await reservar(`2${vuelta}0`);
      elDiaDeSalida();

      const respuestas = await Promise.all([
        checkOut({ medioPago: 'efectivo' }, http(), id),
        ...Array.from({ length: 10 }, () => abonar(1000, {}, http(), id)),
      ]);
      const [salida, ...abonos] = respuestas.map((r) => r.status);

      const cuenta = await folio(id);
      const pagos = await prisma.pago.findMany({ where: { reservaId: id } });
      const pagado = pagos.reduce((s, p) => s + p.monto.toNumber(), 0);
      // El saldo calculado coincide con lo guardado en el libro de pagos.
      expect(cuenta.saldo).toBe(cuenta.debe - pagado);
      if (salida === 201) {
        // El check-out cuenta los abonos que entraron antes; los demás se rechazan.
        expect(cuenta.saldo).toBe(0);
        expect(abonos.every((s) => s === 201 || s === 409)).toBe(true);
      } else {
        // Un abono entró entre la consulta del saldo y el cierre: el check-out no cuadra.
        expect(salida).toBe(400);
        expect(cuenta.estado).toBe('activa');
        expect(abonos.every((s) => s === 201)).toBe(true);
      }
      expect(pagos.filter((p) => p.monto.toNumber() === 1000)).toHaveLength(
        abonos.filter((s) => s === 201).length,
      );
    }
  });

  it('cerrar con saldo pendiente: solo el admin; queda en cuentas por cobrar hasta abonarla', async () => {
    elDiaDeSalida();
    await checkOut(
      { cerrarConSaldo: true, pagos: [{ medio: 'efectivo', monto: 100000 }] },
      comoRecepcionista,
    ).expect(403);
    const res = await checkOut({
      cerrarConSaldo: true,
      pagos: [{ medio: 'efectivo', monto: 100000 }],
    }).expect(201);
    expect(res.body).toMatchObject({ estado: 'cerrada', saldo: 60000 });

    const cuentas = await http().get('/cuentas-por-cobrar').expect(200);
    expect(cuentas.body).toEqual([expect.objectContaining({ reservaId, saldo: 60000 })]);
    await comoRecepcionista.get('/cuentas-por-cobrar').expect(403);

    // Después del cierre solo se abona lo pendiente, y los cargos siguen cerrados.
    await abonar(70000).expect(400);
    await abonar(60000).expect(201);
    await abonar(1000).expect(409);
    expect((await http().get('/cuentas-por-cobrar').expect(200)).body).toEqual([]);
  });

  it('la penalidad de una cancelación tardía se abona; un consumo sigue rechazado', async () => {
    const id = await reservar('102', false);
    reloj.fijar('2030-03-09T10:00:00-05:00'); // menos de 48 h antes de la llegada
    const { body } = await http().post(`/reservas/${id}/cancelar`).expect(201);
    expect(Number(body.total)).toBeGreaterThan(0);

    const cuentas = await http().get('/cuentas-por-cobrar').expect(200);
    expect(cuentas.body.map((c: { reservaId: string }) => c.reservaId)).toEqual([id]);
    await abonar(Number(body.total), {}, http(), id).expect(201);
    expect((await folio(id)).saldo).toBe(0);
    await http()
      .post(`/reservas/${id}/cargos`)
      .send({ categoria: 'minibar', concepto: 'Agua', cantidad: 1, valorUnitario: 6000 })
      .expect(400);
  });

  it('antes del check-in no se registran abonos', async () => {
    const id = await reservar('102', false);
    await abonar(10000, {}, http(), id).expect(400);
  });

  it('los pagos de otro hotel no existen (404)', async () => {
    const { body } = await abonar(10000).expect(201);
    await abonar(10000, {}, comoOtroHotel).expect(404);
    await comoOtroHotel
      .post(`/reservas/${reservaId}/pagos/${body.pagos[0].id}/anular`)
      .send({ motivo: 'x' })
      .expect(404);
    expect((await comoOtroHotel.get('/cuentas-por-cobrar').expect(200)).body).toEqual([]);
  });
});

describe('Migración pagos_del_folio', () => {
  it('lo cobrado antes del libro de pagos queda como pagos y el saldo en 0', async () => {
    await probarMigracion(
      '20261029000000_medios_y_tipos_de_pago',
      [
        // HOTEL_ANTIGUO es anterior al cargo por niño (adultos_y_ninos): aquí ya existe.
        HOTEL_ANTIGUO[0],
        `INSERT INTO tipo_habitacion (id, hotel_id, codigo, nombre, tarifa_base, capacidad_incluida, capacidad_maxima, cargo_persona_adicional, cargo_nino_adicional)
         VALUES ('t1', 'h1', 'doble', 'Doble', 100000, 2, 3, 30000, 15000)`,
        HOTEL_ANTIGUO[2],
        `INSERT INTO huesped (id, hotel_id, nombre, primer_nombre, documento) VALUES ('g1', 'h1', 'Ana', 'Ana', '111')`,
        `INSERT INTO usuario (id, hotel_id, nombre, email, contrasena_hash, rol) VALUES ('u1', 'h1', 'Recepción', 'r@h1.test', 'x', 'recepcionista')`,
        `INSERT INTO reserva (id, hotel_id, habitacion_id, huesped_id, fecha_entrada, fecha_salida, estado, valor_alojamiento, total, medio_pago)
         VALUES ('r1', 'h1', 'c1', 'g1', '2026-01-10', '2026-01-12', 'cerrada', 200000, 230000, 'tarjeta')`,
        `INSERT INTO evento_reserva (id, reserva_id, tipo, usuario_id, fecha) VALUES ('e1', 'r1', 'check_out', 'u1', '2026-01-12 11:00')`,
        `INSERT INTO reserva (id, hotel_id, habitacion_id, huesped_id, fecha_entrada, fecha_salida, estado, valor_alojamiento, total)
         VALUES ('r2', 'h1', 'c1', 'g1', '2026-02-10', '2026-02-12', 'cancelada', 200000, 100000)`,
        `INSERT INTO reserva (id, hotel_id, habitacion_id, huesped_id, fecha_entrada, fecha_salida, estado, valor_alojamiento, total)
         VALUES ('r3', 'h1', 'c1', 'g1', '2026-03-10', '2026-03-12', 'cancelada', 200000, 0)`,
      ],
      async (cliente) => {
        const pagos = await cliente.$queryRawUnsafe<
          { reserva: string; tipo: string; medio: string; monto: string; usuario: string | null }[]
        >(
          `SELECT reserva_id AS reserva, tipo::text, medio::text, monto::text, usuario_id AS usuario
           FROM pago ORDER BY reserva_id`,
        );
        expect(pagos).toEqual([
          { reserva: 'r1', tipo: 'abono', medio: 'tarjeta', monto: '230000.00', usuario: 'u1' },
          { reserva: 'r2', tipo: 'abono', medio: 'otro', monto: '100000.00', usuario: null },
        ]);
      },
    );
  }, 180000);
});
