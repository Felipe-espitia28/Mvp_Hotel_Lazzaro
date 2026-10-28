import { INestApplication } from '@nestjs/common';
import type TestAgent from 'supertest/lib/agent';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  AHORA_POR_DEFECTO,
  RelojFalso,
  crearApp,
  crearHabitacion,
  cuerpoCheckIn,
  cuerpoReserva,
  reiniciar,
} from './utilidades';

// B-5: cuenta empresa y folio dividido. Estadía del 10 al 12 de marzo de
// 2030: 2 noches de $80.000 = $160.000 (huésped con pasaporte, sin IVA).
describe('Cuenta empresa y folio dividido (B-5)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reloj: RelojFalso;
  let http: () => TestAgent; // admin
  let comoRecepcionista: TestAgent;
  let numero = 100;

  const crearEmpresa = async (cambios: object = {}) =>
    (
      await http()
        .post('/empresas')
        .send({
          nit: '900.123.456-8',
          razonSocial: 'Viajes Andinos S.A.S.',
          email: 'Facturacion@ViajesAndinos.co',
          credito: true,
          diasCredito: 30,
          ...cambios,
        })
        .expect(201)
    ).body;

  // Una estadía activa (check-in hecho) a nombre de la empresa, si se da.
  async function estadia(empresaId?: string, reglaEmpresa?: string) {
    reloj.fijar('2030-03-01T10:00:00-05:00');
    const habitacion = await crearHabitacion(prisma, { numero: String(++numero) });
    const { body } = await http()
      .post('/reservas')
      .send({
        ...cuerpoReserva(habitacion.id, '2030-03-10', '2030-03-12'),
        empresaId,
        reglaEmpresa,
      })
      .expect(201);
    reloj.fijar('2030-03-10T15:00:00-05:00');
    await http().post(`/reservas/${body.id}/check-in`).send(cuerpoCheckIn()).expect(201);
    return body.id as string;
  }
  const minibar = (reservaId: string, valor = 12000) =>
    http()
      .post(`/reservas/${reservaId}/cargos`)
      .send({ categoria: 'minibar', concepto: 'Minibar', cantidad: 1, valorUnitario: valor })
      .expect(201);
  const folio = async (reservaId: string) =>
    (await http().get(`/reservas/${reservaId}/folio`).expect(200)).body;
  const checkOut = (reservaId: string, cuerpo: object) => {
    reloj.fijar('2030-03-12T11:00:00-05:00');
    return http().post(`/reservas/${reservaId}/check-out`).send(cuerpo);
  };

  beforeAll(async () => {
    ({ app, prisma, reloj, http, comoRecepcionista } = await crearApp());
  });

  beforeEach(async () => {
    await reiniciar(prisma, reloj);
  });

  afterAll(async () => {
    reloj.fijar(AHORA_POR_DEFECTO);
    await app.close();
  });

  it('con la regla "alojamiento" las noches son de la empresa y el minibar del huésped', async () => {
    const empresa = await crearEmpresa();
    expect(empresa).toMatchObject({
      nit: '900123456',
      digitoVerificacion: '8',
      email: 'facturacion@viajesandinos.co',
    });
    const reservaId = await estadia(empresa.id);
    await minibar(reservaId);

    const cuenta = await folio(reservaId);
    expect(cuenta.empresa).toMatchObject({ razonSocial: 'Viajes Andinos S.A.S.' });
    expect(cuenta.subcuentas.huesped).toMatchObject({ debe: 12000, saldo: 12000 });
    expect(cuenta.subcuentas.empresa).toMatchObject({ debe: 160000, saldo: 160000 });
    expect(cuenta.saldo).toBe(172000);

    // Con "todo", el minibar ya hecho pasa a la empresa, y los nuevos también.
    await http()
      .patch(`/reservas/${reservaId}/empresa`)
      .send({ empresaId: empresa.id, reglaEmpresa: 'todo' })
      .expect(200);
    await minibar(reservaId, 5000);
    const todo = await folio(reservaId);
    expect(todo.subcuentas.huesped.debe).toBe(0);
    expect(todo.subcuentas.empresa.debe).toBe(177000);
  });

  it('mover un cargo cambia los dos saldos y deja un evento', async () => {
    const empresa = await crearEmpresa();
    const reservaId = await estadia(empresa.id);
    const { body } = await minibar(reservaId);
    const cargo = body.cargos[0];

    const { body: movido } = await http()
      .post(`/reservas/${reservaId}/cargos/${cargo.id}/mover`)
      .send({ responsable: 'empresa' })
      .expect(200);
    expect(movido.subcuentas.huesped.saldo).toBe(0);
    expect(movido.subcuentas.empresa.saldo).toBe(172000);
    expect(await prisma.eventoReserva.count({ where: { reservaId, tipo: 'cargo_movido' } })).toBe(
      1,
    );

    // Sin empresa no hay a quién moverlo.
    const sinEmpresa = await estadia();
    const { body: otro } = await minibar(sinEmpresa);
    await http()
      .post(`/reservas/${sinEmpresa}/cargos/${otro.cargos[0].id}/mover`)
      .send({ responsable: 'empresa' })
      .expect(400);
  });

  it('el check-out deja la cuenta de la empresa pendiente solo si tiene crédito', async () => {
    const conCredito = await crearEmpresa();
    const reservaId = await estadia(conCredito.id);
    await minibar(reservaId);
    // El huésped paga lo suyo; la empresa queda a crédito sin pedir permiso.
    await checkOut(reservaId, { pagos: [{ medio: 'efectivo', monto: 12000 }] }).expect(201);
    const porCobrar = (await http().get('/cuentas-por-cobrar').expect(200)).body;
    expect(porCobrar).toEqual([
      expect.objectContaining({
        reservaId,
        responsable: 'empresa',
        empresa: { id: conCredito.id, razonSocial: 'Viajes Andinos S.A.S.' },
        saldo: 160000,
        vencimiento: '2030-04-11T00:00:00.000Z',
      }),
    ]);

    // Sin crédito, la empresa paga al salir.
    const sinCredito = await crearEmpresa({
      nit: '800197268-4',
      razonSocial: 'Contado Ltda.',
      credito: false,
    });
    const otra = await estadia(sinCredito.id);
    await minibar(otra);
    const { body } = await checkOut(otra, { pagos: [{ medio: 'efectivo', monto: 12000 }] }).expect(
      400,
    );
    expect(body.message).toMatch(/Contado Ltda\. no tiene crédito/);
    // El atajo paga las dos cuentas.
    await checkOut(otra, { medioPago: 'tarjeta' }).expect(201);
    const cuenta = await folio(otra);
    expect(cuenta.subcuentas.huesped.saldo).toBe(0);
    expect(cuenta.subcuentas.empresa.saldo).toBe(0);

    // Con el permiso de cerrar con saldo, también puede quedar pendiente.
    const tercera = await estadia(sinCredito.id);
    await checkOut(tercera, { cerrarConSaldo: true, pagos: [] }).expect(201);
  });

  it('un abono de la empresa se reparte en varias reservas, todo o nada', async () => {
    const empresa = await crearEmpresa();
    const reservas: string[] = [];
    for (let i = 0; i < 3; i++) {
      const id = await estadia(empresa.id);
      await checkOut(id, { pagos: [] }).expect(201);
      reservas.push(id);
    }
    const abonar = (pagos: object[]) =>
      comoRecepcionista
        .post(`/empresas/${empresa.id}/abonos`)
        .send({ pagos, medio: 'transferencia', referencia: 'TRF-778' });

    // Uno pasa del saldo de su reserva: no se guarda ninguno.
    await abonar([
      { reservaId: reservas[0], monto: 160000 },
      { reservaId: reservas[1], monto: 100000 },
      { reservaId: reservas[2], monto: 170000 },
    ]).expect(400);
    expect(await prisma.pago.count()).toBe(0);

    // Una reserva que no es de la empresa tampoco.
    const ajena = await estadia();
    await abonar([{ reservaId: ajena, monto: 1000 }]).expect(400);

    const { body } = await abonar([
      { reservaId: reservas[0], monto: 160000 },
      { reservaId: reservas[1], monto: 100000 },
      { reservaId: reservas[2], monto: 160000 },
    ]).expect(201);
    expect(body).toEqual({ pagos: 3, total: 420000 });
    const pagos = await prisma.pago.findMany();
    expect(pagos).toHaveLength(3);
    expect(pagos.every((p) => p.referencia === 'TRF-778' && p.responsable === 'empresa')).toBe(
      true,
    );

    const { body: estado } = await http()
      .get(`/empresas/${empresa.id}/estado-de-cuenta`)
      .expect(200);
    expect(estado.totales).toMatchObject({ debe: 480000, pagado: 420000, saldo: 60000 });
    // A los 31 días de la salida, lo pendiente está vencido.
    reloj.fijar('2030-04-13T10:00:00-05:00');
    const { body: vencido } = await http()
      .get(`/empresas/${empresa.id}/estado-de-cuenta`)
      .expect(200);
    expect(vencido.totales.vencido).toBe(60000);
  });

  it('el NIT es único por hotel aunque se escriba distinto, y se valida el dígito', async () => {
    await crearEmpresa();
    const { body } = await http()
      .post('/empresas')
      .send({ nit: '9001234568', razonSocial: 'Otra', email: 'a@b.co' })
      .expect(409);
    expect(body.message).toMatch(/NIT/);
    await http()
      .post('/empresas')
      .send({ nit: '900.123.456-7', razonSocial: 'Mal escrita', email: 'a@b.co' })
      .expect(400);
    // Recepción busca, pero no crea.
    await comoRecepcionista
      .post('/empresas')
      .send({ nit: '800197268', razonSocial: 'X', email: 'x@y.co' })
      .expect(403);
    const { body: encontradas } = await comoRecepcionista
      .get('/empresas')
      .query({ buscar: '900.123' })
      .expect(200);
    expect(encontradas).toHaveLength(1);
  });

  it('no se quita la empresa si ya tiene pagos a su nombre', async () => {
    const empresa = await crearEmpresa();
    const reservaId = await estadia(empresa.id);
    await http()
      .post(`/reservas/${reservaId}/pagos`)
      .send({ medio: 'transferencia', monto: 50000, responsable: 'empresa' })
      .expect(201);
    await http().patch(`/reservas/${reservaId}/empresa`).send({ empresaId: null }).expect(409);
  });

  it('mover un cargo y hacer el check-out a la vez: el total siempre cuadra', async () => {
    const empresa = await crearEmpresa({ credito: false });
    for (let vuelta = 0; vuelta < 5; vuelta++) {
      const reservaId = await estadia(empresa.id);
      const { body } = await minibar(reservaId);
      reloj.fijar('2030-03-12T11:00:00-05:00');
      const [mover, salida] = await Promise.all([
        http()
          .post(`/reservas/${reservaId}/cargos/${body.cargos[0].id}/mover`)
          .send({ responsable: 'empresa' }),
        http().post(`/reservas/${reservaId}/check-out`).send({ medioPago: 'efectivo' }),
      ]);
      expect(salida.status).toBe(201);
      // O el cambio entró antes del check-out, o llegó tarde y se rechazó.
      expect([200, 400]).toContain(mover.status);
      const cuenta = await folio(reservaId);
      expect(cuenta.total).toBe('172000');
      expect(cuenta.subcuentas.huesped.saldo).toBe(0);
      expect(cuenta.subcuentas.empresa.saldo).toBe(0);
    }
  });
});
