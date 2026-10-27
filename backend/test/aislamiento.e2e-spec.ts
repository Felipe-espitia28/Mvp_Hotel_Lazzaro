import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  CONTRASENA_PRUEBA,
  HOTELES_PRUEBA,
  RelojFalso,
  USUARIOS_PRUEBA,
  crearApp,
  crearHabitacion,
  cuerpoReserva,
  reiniciar,
  cuerpoCheckIn,
} from './utilidades';

const REGISTRO = cuerpoCheckIn();

// Multi-tenant: un hotel nunca ve ni toca los datos de otro. Un id de otro
// hotel responde 404 (no 403), para no revelar siquiera que existe.
describe('Aislamiento entre hoteles', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reloj: RelojFalso;
  let http: () => TestAgent; // admin del hotel principal
  let comoOtroHotel: TestAgent; // admin de otro hotel
  let comoPlataforma: TestAgent; // equipo de Lazaro
  let habitacionId: string;
  let reservaId: string;

  beforeAll(async () => {
    ({ app, prisma, reloj, http, comoOtroHotel, comoPlataforma } = await crearApp());
  });

  beforeEach(async () => {
    await reiniciar(prisma, reloj);
    habitacionId = (await crearHabitacion(prisma)).id;
    const res = await http()
      .post('/reservas')
      .send(cuerpoReserva(habitacionId, '2030-03-10', '2030-03-12'))
      .expect(201);
    reservaId = res.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('cada hotel lista solo lo suyo', async () => {
    const reservas = await comoOtroHotel.get('/reservas').expect(200);
    expect(reservas.body.total).toBe(0);
    const habitaciones = await comoOtroHotel.get('/habitaciones').expect(200);
    expect(habitaciones.body).toEqual([]);
    const tipos = await comoOtroHotel.get('/tipos-habitacion').expect(200);
    expect(tipos.body).toEqual([]);
    const huespedes = await comoOtroHotel.get('/huespedes?buscar=Hu').expect(200);
    expect(huespedes.body).toEqual([]);
    const calendario = await comoOtroHotel.get('/panel/calendario').expect(200);
    expect(calendario.body.reservas).toEqual([]);
    const usuarios = await comoOtroHotel.get('/usuarios').expect(200);
    expect(usuarios.body.map((u: { email: string }) => u.email)).toEqual([
      USUARIOS_PRUEBA.adminOtroHotel.email,
    ]);

    const disponibles = await comoOtroHotel
      .get('/habitaciones/disponibles?desde=2030-03-10&hasta=2030-03-12')
      .expect(200);
    expect(disponibles.body).toEqual([]);
  });

  it('no puede ver ni operar una reserva de otro hotel (404)', async () => {
    reloj.fijar('2030-03-10T15:00:00-05:00');
    await comoOtroHotel.get(`/reservas/${reservaId}/historial`).expect(404);
    await comoOtroHotel.get(`/reservas/${reservaId}/folio`).expect(404);
    await comoOtroHotel.post(`/reservas/${reservaId}/check-in`).send(REGISTRO).expect(404);
    await comoOtroHotel.post(`/reservas/${reservaId}/cancelar`).expect(404);

    // La reserva sigue intacta para su hotel.
    await http().post(`/reservas/${reservaId}/check-in`).send(REGISTRO).expect(201);
    await comoOtroHotel.get(`/reservas/${reservaId}/ocupantes`).expect(404);
    await comoOtroHotel
      .post(`/reservas/${reservaId}/cargos`)
      .send({ categoria: 'minibar', concepto: 'Agua', cantidad: 1, valorUnitario: 5000 })
      .expect(404);
    await comoOtroHotel
      .post(`/reservas/${reservaId}/check-out`)
      .send({ medioPago: 'efectivo' })
      .expect(404);
  });

  it('los reportes legales de un hotel no traen las estadías de otro (A-6)', async () => {
    reloj.fijar('2030-03-10T15:00:00-05:00');
    await http().post(`/reservas/${reservaId}/check-in`).send(REGISTRO).expect(201);
    const rango = { desde: '2030-03-01', hasta: '2030-03-31' };

    expect((await http().get('/reportes-legales/tra').query(rango).expect(200)).body).toHaveLength(
      1,
    );
    for (const reporte of ['tra', 'sire', 'pendientes']) {
      const { body } = await comoOtroHotel
        .get(`/reportes-legales/${reporte}`)
        .query(rango)
        .expect(200);
      expect(body).toEqual([]);
    }
  });

  it('cada hotel tiene su propia política de datos (R45)', async () => {
    await http()
      .post('/hotel/politica-datos')
      .send({ texto: 'Política del principal' })
      .expect(201);

    const delOtro = await comoOtroHotel.get('/hotel/politica-datos').expect(200);
    expect([delOtro.body.version, delOtro.body.hotelId]).toEqual([1, HOTELES_PRUEBA.otro.id]);
    expect(delOtro.body.texto).not.toBe('Política del principal');
    const delPrincipal = await http().get('/hotel/politica-datos').expect(200);
    expect(delPrincipal.body.version).toBe(2);
  });

  it('no puede reservar ni cambiar habitaciones y tipos de otro hotel', async () => {
    await comoOtroHotel
      .post('/reservas')
      .send(cuerpoReserva(habitacionId, '2030-04-10', '2030-04-12'))
      .expect(404);
    await comoOtroHotel
      .patch(`/habitaciones/${habitacionId}/estado`)
      .send({ estado: 'fuera_servicio' })
      .expect(404);

    const tipoId = (await prisma.habitacion.findUniqueOrThrow({ where: { id: habitacionId } }))
      .tipoHabitacionId;
    await comoOtroHotel.patch(`/tipos-habitacion/${tipoId}`).send({ tarifaBase: 1 }).expect(404);
    await comoOtroHotel
      .post('/habitaciones')
      .send({ numero: '999', tipoHabitacionId: tipoId })
      .expect(404);
  });

  it('no puede gestionar usuarios de otro hotel', async () => {
    const admin = await prisma.usuario.findUniqueOrThrow({
      where: { email: USUARIOS_PRUEBA.admin.email },
    });
    await comoOtroHotel.patch(`/usuarios/${admin.id}`).send({ activo: false }).expect(404);
    await comoOtroHotel
      .post(`/usuarios/${admin.id}/restablecer-contrasena`)
      .send({ nueva: 'otra-contrasena' })
      .expect(404);
  });

  it('dos hoteles pueden tener la misma habitación y el mismo huésped', async () => {
    const otra = await crearHabitacion(prisma, { hotelId: HOTELES_PRUEBA.otro.id }); // también la 101
    const res = await comoOtroHotel
      .post('/reservas')
      .send(cuerpoReserva(otra.id, '2030-03-10', '2030-03-12'))
      .expect(201);

    // El mismo documento queda como un cliente distinto en cada hotel.
    const delPrincipal = await http().get('/reservas').expect(200);
    expect(res.body.huespedId).not.toBe(delPrincipal.body.datos[0].huespedId);
    expect(await prisma.huesped.count()).toBe(2);
  });

  it('el equipo de Lazaro no opera las reservas de ningún hotel (403)', async () => {
    await comoPlataforma.get('/reservas').expect(403);
    await comoPlataforma.get('/panel/hoy').expect(403);
    await comoPlataforma.post(`/reservas/${reservaId}/cancelar`).expect(403);
  });

  it('un hotel suspendido no puede entrar, ni con la sesión abierta', async () => {
    await prisma.hotel.update({
      where: { id: HOTELES_PRUEBA.otro.id },
      data: { activo: false },
    });

    const sesion = await comoOtroHotel.get('/reservas').expect(401);
    expect(sesion.body.message).toMatch(/suspendido/);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: USUARIOS_PRUEBA.adminOtroHotel.email, contrasena: CONTRASENA_PRUEBA })
      .expect(401);
    expect(login.body.message).toMatch(/suspendido/);

    // El otro hotel sigue funcionando.
    await http().get('/reservas').expect(200);
  });
});
