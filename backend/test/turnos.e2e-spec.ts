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

// B-3: turnos y cierre de caja. Estadía activa del 10 al 12 de marzo de 2030:
// 2 noches de $80.000 = $160.000 (huésped con pasaporte, sin IVA).
describe('Turnos y cierre de caja (B-3)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reloj: RelojFalso;
  let http: () => TestAgent; // admin
  let comoRecepcionista: TestAgent;
  let reservaId: string;

  const pagar = (como: TestAgent, cuerpo: object) =>
    como.post(`/reservas/${reservaId}/pagos`).send(cuerpo).expect(201);
  const abrir = (como: TestAgent, baseEfectivo = 100000) =>
    como.post('/turnos/abrir').send({ baseEfectivo });

  beforeAll(async () => {
    ({ app, prisma, reloj, http, comoRecepcionista } = await crearApp());
  });

  beforeEach(async () => {
    await reiniciar(prisma, reloj);
    reloj.fijar('2030-03-01T10:00:00-05:00');
    const habitacion = await crearHabitacion(prisma);
    reservaId = (
      await http()
        .post('/reservas')
        .send(cuerpoReserva(habitacion.id, '2030-03-10', '2030-03-12'))
        .expect(201)
    ).body.id;
    reloj.fijar('2030-03-10T15:00:00-05:00');
    await http().post(`/reservas/${reservaId}/check-in`).send(cuerpoCheckIn()).expect(201);
  });

  afterAll(async () => {
    reloj.fijar(AHORA_POR_DEFECTO);
    await app.close();
  });

  it('un usuario no abre dos turnos, ni con dos aperturas simultáneas', async () => {
    const respuestas = await Promise.all([abrir(comoRecepcionista), abrir(comoRecepcionista)]);
    expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409]);
    await abrir(comoRecepcionista).expect(409);
    expect(await prisma.turno.count({ where: { cerradoEn: null } })).toBe(1);
    // Otro usuario sí puede tener el suyo.
    await abrir(http()).expect(201);
  });

  it('cuadra por medio y guarda lo contado con su diferencia', async () => {
    const { body: turno } = await abrir(comoRecepcionista).expect(201);
    // Abonos: $100.000 y $50.000 en efectivo, $40.000 con tarjeta → pagó
    // $190.000 por $160.000: devuelve $30.000 en efectivo.
    await pagar(comoRecepcionista, { medio: 'efectivo', monto: 100000 });
    await pagar(comoRecepcionista, { medio: 'efectivo', monto: 50000 });
    await pagar(comoRecepcionista, { medio: 'tarjeta', monto: 40000 });
    await pagar(comoRecepcionista, { tipo: 'reembolso', medio: 'efectivo', monto: 30000 });

    const { body: actual } = await comoRecepcionista.get('/turnos/actual').expect(200);
    // Esperado = base 100.000 + 150.000 − 30.000 = $220.000.
    expect(actual.turno.resumen).toMatchObject({
      baseEfectivo: 100000,
      esperadoEfectivo: 220000,
      porMedio: [
        { medio: 'efectivo', ingresos: 150000, reembolsos: 30000, ajustes: 0, neto: 120000 },
        { medio: 'tarjeta', ingresos: 40000, reembolsos: 0, ajustes: 0, neto: 40000 },
      ],
    });

    reloj.fijar('2030-03-10T22:00:00-05:00');
    const { body: cerrado } = await comoRecepcionista
      .post(`/turnos/${turno.id}/cerrar`)
      .send({ efectivoContado: 210000, observaciones: 'Faltó un billete' })
      .expect(200);
    expect(cerrado.resumen).toMatchObject({ efectivoContado: 210000, diferencia: -10000 });
    const guardado = await prisma.turno.findUniqueOrThrow({ where: { id: turno.id } });
    expect(Number(guardado.efectivoContado)).toBe(210000);
    expect(guardado.resumenCierre).toMatchObject({ diferencia: -10000, esperadoEfectivo: 220000 });
    expect(guardado.cerradoEn).not.toBeNull();

    // Un turno cerrado no se reabre ni se vuelve a cerrar.
    await comoRecepcionista
      .post(`/turnos/${turno.id}/cerrar`)
      .send({ efectivoContado: 220000 })
      .expect(409);
    expect((await comoRecepcionista.get('/turnos/actual').expect(200)).body.turno).toBeNull();
  });

  it('anular después del cierre no cambia el cierre y es un ajuste del turno actual', async () => {
    const { body: delRecepcionista } = await abrir(comoRecepcionista, 0).expect(201);
    const { body: pago } = await pagar(comoRecepcionista, { medio: 'efectivo', monto: 100000 });
    const pagoId = pago.pagos[0].id;
    await comoRecepcionista
      .post(`/turnos/${delRecepcionista.id}/cerrar`)
      .send({ efectivoContado: 100000 })
      .expect(200);
    const antes = (await prisma.turno.findUniqueOrThrow({ where: { id: delRecepcionista.id } }))
      .resumenCierre;

    // Al día siguiente el admin, con su turno abierto, anula ese abono.
    reloj.fijar('2030-03-11T09:00:00-05:00');
    const { body: delAdmin } = await abrir(http(), 50000).expect(201);
    await http()
      .post(`/reservas/${reservaId}/pagos/${pagoId}/anular`)
      .send({ motivo: 'Se registró dos veces' })
      .expect(201);

    expect(
      (await prisma.turno.findUniqueOrThrow({ where: { id: delRecepcionista.id } })).resumenCierre,
    ).toEqual(antes);
    const { body: actual } = await http().get('/turnos/actual').expect(200);
    expect(actual.turno.id).toBe(delAdmin.id);
    expect(actual.turno.resumen.porMedio).toEqual([
      { medio: 'efectivo', ingresos: 0, reembolsos: 0, ajustes: -100000, neto: -100000 },
    ]);
    expect(actual.turno.resumen.esperadoEfectivo).toBe(-50000);
  });

  it('un pago sin turno se permite y aparece en el aviso del admin', async () => {
    await abrir(comoRecepcionista).expect(201); // el hotel ya usa turnos
    // El admin no tiene turno abierto: su abono queda sin turno.
    const { body } = await pagar(http(), { medio: 'tarjeta', monto: 20000 });
    expect(body.pagos[0]).toMatchObject({ monto: '20000' });

    const { body: aviso } = await http().get('/turnos/sin-turno').expect(200);
    expect(aviso.pagos.map((p: { monto: string }) => Number(p.monto))).toEqual([20000]);
    expect(aviso.pagos[0].usuario.nombre).toBeDefined();
    await comoRecepcionista.get('/turnos/sin-turno').expect(403);
  });

  it('recepción ve solo sus turnos y no cierra el de otro; el admin los ve todos', async () => {
    const { body: delAdmin } = await abrir(http()).expect(201);
    await abrir(comoRecepcionista).expect(201);
    const propios = (await comoRecepcionista.get('/turnos').expect(200)).body;
    expect(propios).toHaveLength(1);
    expect((await http().get('/turnos').expect(200)).body).toHaveLength(2);
    await comoRecepcionista
      .post(`/turnos/${delAdmin.id}/cerrar`)
      .send({ efectivoContado: 0 })
      .expect(403);
  });
});
