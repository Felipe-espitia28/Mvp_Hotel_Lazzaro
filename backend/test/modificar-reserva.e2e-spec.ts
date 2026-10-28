import { INestApplication } from '@nestjs/common';
import type TestAgent from 'supertest/lib/agent';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  HOTELES_PRUEBA,
  RelojFalso,
  crearApp,
  crearHabitacion,
  cuerpoCheckIn,
  cuerpoReserva,
  reiniciar,
} from './utilidades';

type Noche = { fecha: string; temporada: string; tarifa: number; conservada?: boolean };

// A-5 (R7): modificar una reserva sin cancelarla. El precio se recalcula solo
// por lo que cambia y la garantía de no-sobreventa (EXCLUDE) no cambia.
// El huésped de prueba tiene pasaporte: exento de IVA, los totales son la suma.
describe('Modificar una reserva', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reloj: RelojFalso;
  let http: () => TestAgent; // admin
  let comoRecepcionista: TestAgent;
  let comoOtroHotel: TestAgent;
  let habitacionId: string; // 101, tarifa 80.000

  const reservar = async (entrada: string, salida: string, id = habitacionId) =>
    (
      await http()
        .post('/reservas')
        .send(cuerpoReserva(id, entrada, salida))
        .expect(201)
    ).body.id as string;
  const modificar = (id: string, cambios: Record<string, unknown>, como = http()) =>
    como.patch(`/reservas/${id}`).send(cambios);

  beforeAll(async () => {
    ({ app, prisma, reloj, http, comoRecepcionista, comoOtroHotel } = await crearApp());
  });

  beforeEach(async () => {
    await reiniciar(prisma, reloj);
    habitacionId = (await crearHabitacion(prisma, { numero: '101' })).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('extender 2 noches en temporada alta: las pactadas conservan su tarifa y las nuevas se cotizan hoy', async () => {
    // 13 y 14 de diciembre: baja, a 80.000.
    const id = await reservar('2030-12-13', '2030-12-15');
    // Después de reservar, el hotel sube la tarifa base.
    await prisma.tipoHabitacion.updateMany({ data: { tarifaBase: 100000 } });

    // La cotización no guarda nada.
    const { body: cotizacion } = await http()
      .post(`/reservas/${id}/cotizar-modificacion`)
      .send({ fechaSalida: '2030-12-17' })
      .expect(200);
    expect(cotizacion).toMatchObject({ totalAnterior: 160000, total: 420000, diferencia: 260000 });
    expect(
      (await prisma.reserva.findUniqueOrThrow({ where: { id } })).valorAlojamiento.toNumber(),
    ).toBe(160000);

    const { body } = await modificar(id, { fechaSalida: '2030-12-17' }).expect(200);
    expect(
      (body.desglose.noches as Noche[]).map((n) => [n.fecha, n.temporada, n.tarifa, n.conservada]),
    ).toEqual([
      ['2030-12-13', 'baja', 80000, true],
      ['2030-12-14', 'baja', 80000, true],
      ['2030-12-15', 'alta', 130000, undefined],
      ['2030-12-16', 'alta', 130000, undefined],
    ]);
    expect(body).toMatchObject({ valorAlojamiento: '420000', diferencia: 260000, penalidad: 0 });
  });

  it('con la tarifa por noche mantenida (solo admin) las noches nuevas van a la media pactada', async () => {
    const id = await reservar('2030-12-13', '2030-12-15');
    await prisma.tipoHabitacion.updateMany({ data: { tarifaBase: 100000 } });
    await modificar(
      id,
      { fechaSalida: '2030-12-17', mantenerTarifaPorNoche: true },
      comoRecepcionista,
    ).expect(403);
    const { body } = await modificar(id, {
      fechaSalida: '2030-12-17',
      mantenerTarifaPorNoche: true,
    }).expect(200);
    expect(body.valorAlojamiento).toBe('320000');
  });

  it('mover la reserva a fechas ocupadas → 409 y no cambia nada', async () => {
    const id = await reservar('2030-03-10', '2030-03-12');
    await reservar('2030-03-14', '2030-03-16');
    const res = await modificar(id, { fechaSalida: '2030-03-15' }).expect(409);
    expect(res.body.message).toMatch(/solapa/);
    const reserva = await prisma.reserva.findUniqueOrThrow({ where: { id } });
    expect(reserva.fechaSalida.toISOString().slice(0, 10)).toBe('2030-03-12');
    // Mover sin solaparse con la propia reserva sí se puede.
    await modificar(id, { fechaEntrada: '2030-03-11', fechaSalida: '2030-03-13' }).expect(200);
  });

  it('concurrencia: dos modificaciones simultáneas hacia el mismo hueco → gana una', async () => {
    const otraId = (await crearHabitacion(prisma, { numero: '102' })).id;
    const destinoId = (await crearHabitacion(prisma, { numero: '103' })).id;
    const a = await reservar('2030-03-10', '2030-03-12');
    const b = await reservar('2030-03-10', '2030-03-12', otraId);

    const cambio = {
      habitacionId: destinoId,
      fechaEntrada: '2030-03-20',
      fechaSalida: '2030-03-22',
    };
    const respuestas = await Promise.all([modificar(a, cambio), modificar(b, cambio)]);
    expect(respuestas.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await prisma.reserva.count({ where: { habitacionId: destinoId } })).toBe(1);
  });

  it('a una habitación más cara se recalcula; con decisión del hotel (solo admin) se conserva el precio', async () => {
    const suiteId = (await crearHabitacion(prisma, { numero: '201', tarifaNoche: 150000 })).id;
    const id = await reservar('2030-03-10', '2030-03-12');

    const { body: cotizacion } = await http()
      .post(`/reservas/${id}/cotizar-modificacion`)
      .send({ habitacionId: suiteId })
      .expect(200);
    expect(cotizacion).toMatchObject({ total: 300000, diferencia: 140000 });

    await modificar(
      id,
      { habitacionId: suiteId, motivo: 'decision_hotel' },
      comoRecepcionista,
    ).expect(403);
    const { body } = await modificar(id, {
      habitacionId: suiteId,
      motivo: 'decision_hotel',
    }).expect(200);
    expect(body).toMatchObject({
      habitacionId: suiteId,
      valorAlojamiento: '160000',
      diferencia: 0,
    });
  });

  it('acortar dentro del plazo de penalidad cobra la penalidad sobre las noches eliminadas', async () => {
    // Ya pasó el plazo gratuito (48 h antes del check-in del 2 de enero). Enero
    // es temporada alta: 104.000 por noche.
    const id = await reservar('2030-01-02', '2030-01-05');
    const { body } = await modificar(id, { fechaSalida: '2030-01-04' }).expect(200);
    expect(body).toMatchObject({ valorAlojamiento: '208000', penalidad: 104000 });

    const { body: folio } = await http().get(`/reservas/${id}/folio`).expect(200);
    expect(folio.cargos).toMatchObject([
      {
        concepto: 'Penalidad por acortar la estadía (1 noche)',
        categoria: 'otro',
        total: '104000',
      },
    ]);
    expect(folio.saldo).toBe(208000 + 104000);

    // Si después la cancela, la penalidad de acortar no se pierde.
    const { body: cancelada } = await http().post(`/reservas/${id}/cancelar`).expect(201);
    expect(cancelada.total).toBe(String(104000 + 104000));
  });

  it('acortar fuera del plazo de penalidad es gratis, y mover sin acortar no cobra', async () => {
    const id = await reservar('2030-03-10', '2030-03-13');
    const { body } = await modificar(id, { fechaSalida: '2030-03-12' }).expect(200);
    expect(body.penalidad).toBe(0);

    const tarde = await reservar('2030-01-02', '2030-01-04');
    const { body: movida } = await modificar(tarde, {
      fechaEntrada: '2030-01-03',
      fechaSalida: '2030-01-05',
    }).expect(200);
    expect(movida.penalidad).toBe(0);
    expect(await prisma.cargo.count()).toBe(0);
  });

  it('con la estadía activa: cambiar de habitación deja la anterior en limpieza y la nueva debe estar libre', async () => {
    const nuevaId = (await crearHabitacion(prisma, { numero: '102' })).id;
    const id = await reservar('2030-03-10', '2030-03-13');
    reloj.fijar('2030-03-10T15:00:00-05:00');
    await http().post(`/reservas/${id}/check-in`).send(cuerpoCheckIn()).expect(201);

    await prisma.habitacion.update({ where: { id: nuevaId }, data: { estado: 'en_limpieza' } });
    const ocupada = await modificar(id, { habitacionId: nuevaId }).expect(400);
    expect(ocupada.body.message).toMatch(/limpieza/);

    await prisma.habitacion.update({ where: { id: nuevaId }, data: { estado: 'libre' } });
    await modificar(id, { habitacionId: nuevaId }).expect(200);
    const estados = await prisma.habitacion.findMany({
      where: { id: { in: [habitacionId, nuevaId] } },
      orderBy: { numero: 'asc' },
    });
    expect(estados.map((h) => [h.numero, h.estado])).toEqual([
      ['101', 'en_limpieza'],
      ['102', 'ocupada'],
    ]);

    // La entrada ya ocurrió: no se cambia.
    await modificar(id, { fechaEntrada: '2030-03-11' }).expect(400);
  });

  it('con la estadía activa, adelantar la salida no cobra penalidad (R24)', async () => {
    const id = await reservar('2030-01-02', '2030-01-06');
    reloj.fijar('2030-01-02T15:00:00-05:00');
    await http().post(`/reservas/${id}/check-in`).send(cuerpoCheckIn()).expect(201);
    reloj.fijar('2030-01-03T10:00:00-05:00');
    const { body } = await modificar(id, { fechaSalida: '2030-01-04' }).expect(200);
    expect(body).toMatchObject({ penalidad: 0, valorAlojamiento: '208000' });
    // Para irse hoy se hace el check-out.
    await modificar(id, { fechaSalida: '2030-01-03' }).expect(400);
  });

  it('una reserva cancelada o cerrada no se modifica (409)', async () => {
    const id = await reservar('2030-03-10', '2030-03-12');
    await http().post(`/reservas/${id}/cancelar`).expect(201);
    await modificar(id, { fechaSalida: '2030-03-13' }).expect(409);
    await http()
      .post(`/reservas/${id}/cotizar-modificacion`)
      .send({ fechaSalida: '2030-03-13' })
      .expect(409);
  });

  it('el evento "modificada" guarda el antes, el después y el desglose reemplazado', async () => {
    const otraId = (await crearHabitacion(prisma, { numero: '102' })).id;
    const id = await reservar('2030-03-10', '2030-03-12');
    await modificar(id, { habitacionId: otraId, fechaSalida: '2030-03-13', adultos: 2 }).expect(
      200,
    );

    const { body: historial } = await http().get(`/reservas/${id}/historial`).expect(200);
    const evento = historial.find((e: { tipo: string }) => e.tipo === 'modificada');
    expect(evento.detalle).toBe(
      'Fechas 2030-03-10 a 2030-03-12 → 2030-03-10 a 2030-03-13 · Habitación 101 → 102 · ' +
        '1 adulto → 2 adultos · Total $160.000 → $240.000',
    );
    const guardado = await prisma.eventoReserva.findFirstOrThrow({ where: { tipo: 'modificada' } });
    expect(guardado.datos).toMatchObject({
      antes: { habitacion: '101', fechaSalida: '2030-03-12', adultos: 1, total: 160000 },
      despues: { habitacion: '102', fechaSalida: '2030-03-13', adultos: 2, total: 240000 },
      desgloseAnterior: { total: 160000 },
    });
    // Sin cambios no hay nada que aplicar.
    await modificar(id, {}).expect(400);
  });

  it('las personas no pueden pasar de la capacidad de la habitación', async () => {
    const id = await reservar('2030-03-10', '2030-03-12');
    const res = await modificar(id, { adultos: 3, edadesNinos: [5, 8] }).expect(400);
    expect(res.body.message).toMatch(/máximo 4/);
  });

  it('aislamiento: otro hotel no cotiza ni modifica, ni usa sus habitaciones', async () => {
    const id = await reservar('2030-03-10', '2030-03-12');
    await modificar(id, { fechaSalida: '2030-03-13' }, comoOtroHotel).expect(404);
    await comoOtroHotel
      .post(`/reservas/${id}/cotizar-modificacion`)
      .send({ fechaSalida: '2030-03-13' })
      .expect(404);
    // Una habitación de otro hotel "no existe" para este.
    const ajena = await crearHabitacion(prisma, { numero: '999', hotelId: HOTELES_PRUEBA.otro.id });
    await modificar(id, { habitacionId: ajena.id }).expect(404);
  });
});
