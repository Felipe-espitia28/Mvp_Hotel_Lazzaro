import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { PrismaService } from '../src/prisma/prisma.service';
import { PagosEnLineaService } from '../src/pagos-en-linea/pagos-en-linea.service';
import {
  PasarelaSimulada,
  eventoSimulado,
} from '../src/pagos-en-linea/pasarela-simulada.adaptador';
import { Transaccion } from '../src/pagos-en-linea/puerto';
import {
  AHORA_POR_DEFECTO,
  HOTELES_PRUEBA,
  RelojFalso,
  crearApp,
  crearHabitacion,
  cuerpoReserva,
  reiniciar,
} from './utilidades';

const LLAVES = {
  llavePublica: 'pub_test_Q5yDA9xoKdePzhSGeVe9HAez7HgGORGf',
  llavePrivada: 'prv_test_privada_muy_secreta',
  secretoEventos: 'test_events_secreto_de_eventos',
  secretoIntegridad: 'test_integrity_secreto_de_integridad',
};

// B-2: pagos en línea con la pasarela simulada y eventos firmados igual que
// Wompi. Reserva del 10 al 12 de marzo de 2030: 2 noches de $80.000 =
// $160.000, anticipo sugerido del 30% = $48.000.
describe('Pagos en línea (B-2)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reloj: RelojFalso;
  let http: () => TestAgent; // admin
  let comoRecepcionista: TestAgent;
  let reservaId: string;

  const webhook = (cuerpo: object, slug: string = HOTELES_PRUEBA.principal.slug) =>
    request(app.getHttpServer()).post(`/webhooks/wompi/${slug}`).send(cuerpo);
  const crearLink = (cuerpo: object = {}) =>
    http().post(`/reservas/${reservaId}/link-de-pago`).send(cuerpo).expect(201);
  const transaccion = (referencia: string, cambios: Partial<Transaccion> = {}): Transaccion => ({
    id: 'tx-1',
    referencia,
    montoEnCentavos: 4800000,
    moneda: 'COP',
    estado: 'aprobada',
    ...cambios,
  });
  const saldo = async () =>
    (await http().get(`/reservas/${reservaId}/folio`).expect(200)).body.saldo as number;

  beforeAll(async () => {
    ({ app, prisma, reloj, http, comoRecepcionista } = await crearApp());
  });

  beforeEach(async () => {
    process.env.PASARELA_PROVEEDOR = 'simulada';
    await reiniciar(prisma, reloj);
    const habitacion = await crearHabitacion(prisma);
    reservaId = (
      await http()
        .post('/reservas')
        .send(cuerpoReserva(habitacion.id, '2030-03-10', '2030-03-12'))
        .expect(201)
    ).body.id;
  });

  afterAll(async () => {
    process.env.PASARELA_PROVEEDOR = 'simulada';
    reloj.fijar(AHORA_POR_DEFECTO);
    await app.close();
  });

  it('el link cobra por defecto el anticipo sugerido y queda en la auditoría', async () => {
    const { body: intento } = await crearLink();
    expect(intento).toMatchObject({ monto: '48000', estado: 'creado', proveedor: 'simulada' });
    expect(intento.url).toBe(
      `http://localhost:5173/pago-simulado?referencia=${intento.referencia}`,
    );
    const eventos = await prisma.eventoReserva.findMany({
      where: { reservaId, tipo: 'link_de_pago' },
    });
    expect(eventos).toHaveLength(1);
    // Otro monto, sin pasar del saldo.
    expect((await crearLink({ monto: 20000 })).body.monto).toBe('20000');
    await http().post(`/reservas/${reservaId}/link-de-pago`).send({ monto: 200000 }).expect(400);
    expect(
      (await http().get(`/reservas/${reservaId}/intentos-de-pago`).expect(200)).body,
    ).toHaveLength(2);
  });

  it('un evento aprobado y firmado crea un pago de la pasarela y baja el saldo', async () => {
    const { body: intento } = await crearLink();
    expect(await saldo()).toBe(160000);

    await webhook(eventoSimulado(transaccion(intento.referencia), new Date())).expect(200);

    expect(await saldo()).toBe(112000);
    const pago = await prisma.pago.findFirstOrThrow({ where: { reservaId } });
    expect(pago).toMatchObject({
      tipo: 'anticipo',
      medio: 'pasarela',
      referencia: 'tx-1',
      usuarioId: null,
      turnoId: null,
    });
    expect(await prisma.intentoPago.findUniqueOrThrow({ where: { id: intento.id } })).toMatchObject(
      { estado: 'aprobado', pagoId: pago.id, idTransaccionProveedor: 'tx-1' },
    );
    // Lo registró el sistema: no es un pago "sin turno" de nadie.
    await http().post('/turnos/abrir').send({ baseEfectivo: 0 }).expect(201);
    reloj.fijar('2030-01-01T13:00:00-05:00');
    expect((await http().get('/turnos/sin-turno').expect(200)).body.pagos).toEqual([]);
  });

  it('el mismo evento 5 veces en simultáneo crea un solo pago', async () => {
    const { body: intento } = await crearLink();
    const evento = eventoSimulado(transaccion(intento.referencia), new Date());
    const respuestas = await Promise.all(Array.from({ length: 5 }, () => webhook(evento)));
    expect(respuestas.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect(await prisma.pago.count({ where: { reservaId } })).toBe(1);
    expect(await saldo()).toBe(112000);
  });

  it('una firma inválida responde 401 y no cambia nada', async () => {
    const { body: intento } = await crearLink();
    const conOtroSecreto = eventoSimulado(transaccion(intento.referencia), new Date(), 'otro');
    await webhook(conOtroSecreto).expect(401);
    const alterado = eventoSimulado(transaccion(intento.referencia), new Date());
    (alterado.data.transaction as { amount_in_cents: number }).amount_in_cents = 100;
    await webhook(alterado).expect(401);
    await webhook({ event: 'transaction.updated' }).expect(401);

    expect(await prisma.pago.count()).toBe(0);
    expect((await prisma.intentoPago.findUniqueOrThrow({ where: { id: intento.id } })).estado).toBe(
      'creado',
    );
  });

  it('un monto distinto al del intento no se registra y deja una alerta', async () => {
    const { body: intento } = await crearLink();
    const evento = eventoSimulado(
      transaccion(intento.referencia, { montoEnCentavos: 100000 }),
      new Date(),
    );
    await webhook(evento).expect(200);
    await webhook(evento).expect(200);

    expect(await prisma.pago.count()).toBe(0);
    const guardado = await prisma.intentoPago.findUniqueOrThrow({ where: { id: intento.id } });
    expect(guardado.estado).toBe('creado');
    expect(guardado.alerta).toContain('$1.000');
    // Una sola alerta aunque el evento llegue dos veces.
    expect(
      await prisma.eventoReserva.count({ where: { reservaId, tipo: 'alerta_pago_en_linea' } }),
    ).toBe(1);
  });

  it('un evento rechazado deja el intento rechazado y sin pago', async () => {
    const { body: intento } = await crearLink();
    await webhook(
      eventoSimulado(transaccion(intento.referencia, { estado: 'rechazada' }), new Date()),
    ).expect(200);
    expect((await prisma.intentoPago.findUniqueOrThrow({ where: { id: intento.id } })).estado).toBe(
      'rechazado',
    );
    expect(await prisma.pago.count()).toBe(0);
  });

  it('una referencia desconocida responde 200 sin hacer nada', async () => {
    await webhook(eventoSimulado(transaccion('PGNOEXISTE'), new Date())).expect(200);
    await webhook(eventoSimulado(transaccion('PGNOEXISTE'), new Date()), 'no-existe').expect(404);
    expect(await prisma.pago.count()).toBe(0);
  });

  it('la página simulada aprueba por el webhook; la de retorno solo muestra el estado', async () => {
    const { body: intento } = await crearLink();
    const publico = () => request(app.getHttpServer());
    expect(
      (await publico().get(`/publico/pago-simulado/${intento.referencia}`).expect(200)).body,
    ).toMatchObject({ monto: '48000', estado: 'creado', hotel: 'Hotel Prueba' });

    const { body } = await publico()
      .post(`/publico/pago-simulado/${intento.referencia}`)
      .send({ aprobar: true })
      .expect(200);
    expect(body).toEqual({ estado: 'aprobado', monto: '48000', hotel: 'Hotel Prueba' });
    expect(await prisma.pago.count({ where: { reservaId } })).toBe(1);
    await publico()
      .post(`/publico/pago-simulado/${intento.referencia}`)
      .send({ aprobar: true })
      .expect(409);
    expect(
      (await publico().get(`/publico/pagos/${intento.referencia}/estado`).expect(200)).body.estado,
    ).toBe('aprobado');
  });

  it('la reconciliación aprueba un intento cuyo webhook nunca llegó y expira los vencidos', async () => {
    const pagos = app.get(PagosEnLineaService);
    const { body: pagado } = await crearLink();
    const { body: olvidado } = await crearLink({ monto: 10000 });
    // Se pulsó "Aprobar", pero el evento no llegó.
    PasarelaSimulada.decidir(pagado.referencia, 4800000, true, new Date());

    // Antes de 15 minutos no se consulta.
    reloj.fijar('2030-01-01T12:10:00-05:00');
    expect(await pagos.reconciliar()).toEqual({ revisados: 0, resueltos: 0 });

    reloj.fijar('2030-01-01T12:20:00-05:00');
    expect(await pagos.reconciliar()).toEqual({ revisados: 2, resueltos: 1 });
    expect(await prisma.pago.count({ where: { reservaId } })).toBe(1);
    expect((await prisma.intentoPago.findUniqueOrThrow({ where: { id: pagado.id } })).estado).toBe(
      'aprobado',
    );

    // A las 48 horas, el que nadie pagó vence.
    reloj.fijar('2030-01-03T12:30:00-05:00');
    await pagos.reconciliar();
    expect(
      (await prisma.intentoPago.findUniqueOrThrow({ where: { id: olvidado.id } })).estado,
    ).toBe('expirado');
  });

  it('un pago que entra a una reserva cancelada se registra y queda como saldo a favor', async () => {
    const { body: intento } = await crearLink({ monto: 20000 });
    await http().post(`/reservas/${reservaId}/cancelar`).send({}).expect(201);
    await webhook(
      eventoSimulado(transaccion(intento.referencia, { montoEnCentavos: 2000000 }), new Date()),
    ).expect(200);
    expect(await prisma.pago.findFirstOrThrow({ where: { reservaId } })).toMatchObject({
      tipo: 'abono',
      medio: 'pasarela',
    });
    expect(await saldo()).toBeLessThan(0);
  });

  it('las llaves se guardan cifradas, nunca se devuelven y solo se aceptan las de pruebas', async () => {
    const { body } = await http().put('/pagos-en-linea/llaves').send(LLAVES).expect(200);
    expect(body).toMatchObject({ configurada: true, ambiente: 'pruebas' });
    const respuestas = [
      JSON.stringify(body),
      JSON.stringify((await http().get('/pagos-en-linea/estado').expect(200)).body),
    ];
    for (const texto of respuestas) {
      for (const llave of Object.values(LLAVES)) expect(texto).not.toContain(llave);
    }
    const [fila] = await prisma.$queryRaw<Record<string, string>[]>`
      SELECT * FROM configuracion_pasarela WHERE hotel_id = ${HOTELES_PRUEBA.principal.id}`;
    for (const llave of Object.values(LLAVES)) expect(JSON.stringify(fila)).not.toContain(llave);

    await http()
      .put('/pagos-en-linea/llaves')
      .send({ ...LLAVES, llavePublica: 'pub_prod_abc', llavePrivada: 'prv_prod_abc' })
      .expect(400);
    // Solo el admin conecta la cuenta.
    await comoRecepcionista.put('/pagos-en-linea/llaves').send(LLAVES).expect(403);
  });

  it('con Wompi y un hotel sin llaves no hay link (409) y el estado dice sin configurar', async () => {
    process.env.PASARELA_PROVEEDOR = 'wompi';
    const { body: estado } = await http().get('/pagos-en-linea/estado').expect(200);
    expect(estado).toMatchObject({
      proveedor: 'wompi',
      configurada: false,
      disponible: false,
      mensaje: 'Conecte su cuenta de Wompi en Gerencia → Pagos en línea',
      urlWebhook: expect.stringContaining('/webhooks/wompi/hotel-prueba'),
    });
    const { body } = await http().post(`/reservas/${reservaId}/link-de-pago`).send({}).expect(409);
    expect(body.message).toBe('Conecte su cuenta de Wompi en Gerencia → Pagos en línea');
    // La página simulada no existe fuera del modo simulado.
    await request(app.getHttpServer()).get('/publico/pago-simulado/PGCUALQUIERA').expect(404);

    // Con las llaves, el link es el del Web Checkout de Wompi.
    await http().put('/pagos-en-linea/llaves').send(LLAVES).expect(200);
    const { body: intento } = await crearLink();
    expect(intento.url).toMatch(/^https:\/\/checkout\.wompi\.co\/p\/\?public-key=pub_test_/);
    expect(intento.proveedor).toBe('wompi');
  });
});
