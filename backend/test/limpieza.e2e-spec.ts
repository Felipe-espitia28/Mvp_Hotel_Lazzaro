import { INestApplication } from '@nestjs/common';
import type TestAgent from 'supertest/lib/agent';
import { PrismaService } from '../src/prisma/prisma.service';
import { LimpiezaService } from '../src/limpieza/limpieza.service';
import {
  AHORA_POR_DEFECTO,
  HOTELES_PRUEBA,
  RelojFalso,
  USUARIOS_PRUEBA,
  crearApp,
  crearHabitacion,
  cuerpoCheckIn,
  cuerpoReserva,
  reiniciar,
} from './utilidades';

// B-4: tareas de limpieza e incidencias. "Hoy": 2030-01-01; el huésped de la
// 101 llega el 1 y sale el 3.
describe('Limpieza e incidencias (B-4)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reloj: RelojFalso;
  let http: () => TestAgent; // admin
  let comoRecepcionista: TestAgent;
  let comoCamarera: TestAgent;
  let habitacionId: string;
  let reservaId: string;

  const estado = async (id = habitacionId) =>
    (await prisma.habitacion.findUniqueOrThrow({ where: { id } })).estado;
  const tareasDe = async (cliente: TestAgent, query: object = {}) =>
    (await cliente.get('/limpieza/tareas').query(query).expect(200)).body;
  const idDe = async (usuario: { email: string }) =>
    (await prisma.usuario.findUniqueOrThrow({ where: { email: usuario.email } })).id;

  async function hacerCheckOut() {
    await http().post(`/reservas/${reservaId}/check-in`).send(cuerpoCheckIn()).expect(201);
    reloj.fijar('2030-01-03T11:00:00-05:00');
    await http()
      .post(`/reservas/${reservaId}/check-out`)
      .send({ medioPago: 'efectivo' })
      .expect(201);
  }

  beforeAll(async () => {
    ({ app, prisma, reloj, http, comoRecepcionista, comoCamarera } = await crearApp());
  });

  beforeEach(async () => {
    await reiniciar(prisma, reloj);
    habitacionId = (await crearHabitacion(prisma)).id;
    reservaId = (
      await http()
        .post('/reservas')
        .send(cuerpoReserva(habitacionId, '2030-01-01', '2030-01-03'))
        .expect(201)
    ).body.id;
  });

  afterAll(async () => {
    reloj.fijar(AHORA_POR_DEFECTO);
    await app.close();
  });

  it('el check-out crea la tarea "salida"; terminarla deja la habitación libre', async () => {
    await hacerCheckOut();
    expect(await estado()).toBe('en_limpieza');

    const { tareas, avance } = await tareasDe(comoCamarera);
    expect(tareas).toHaveLength(1);
    expect(tareas[0]).toMatchObject({
      tipo: 'salida',
      estado: 'pendiente',
      asignadaA: null,
      habitacion: { numero: '101', estado: 'en_limpieza' },
    });
    expect(avance).toEqual({ total: 1, terminadas: 0, porcentaje: 0 });

    // La camarera toma la tarea sin asignar al iniciarla.
    const { body: iniciada } = await comoCamarera
      .patch(`/limpieza/tareas/${tareas[0].id}`)
      .send({ accion: 'iniciar' })
      .expect(200);
    expect(iniciada).toMatchObject({
      estado: 'en_proceso',
      asignadaA: { nombre: USUARIOS_PRUEBA.housekeeping.nombre },
    });
    await comoCamarera
      .patch(`/limpieza/tareas/${tareas[0].id}`)
      .send({ accion: 'terminar', observaciones: 'Faltan toallas' })
      .expect(200);
    expect(await estado()).toBe('libre');
    expect((await tareasDe(http())).avance).toEqual({ total: 1, terminadas: 1, porcentaje: 100 });
  });

  it('la camarera no ve reservas, huéspedes ni el folio, ni hace la tarea de otra persona', async () => {
    await comoCamarera.get('/reservas').expect(403);
    await comoCamarera.get('/huespedes').expect(403);
    await comoCamarera.get(`/reservas/${reservaId}/folio`).expect(403);
    await comoCamarera.get('/habitaciones').expect(200);
    await comoCamarera
      .patch(`/habitaciones/${habitacionId}/estado`)
      .send({ estado: 'libre' })
      .expect(403);

    await hacerCheckOut();
    const [tarea] = (await tareasDe(http())).tareas;
    await http()
      .post('/limpieza/tareas/asignar')
      .send({ tareaIds: [tarea.id], usuarioId: await idDe(USUARIOS_PRUEBA.recepcionista) })
      .expect(201);

    // Ya no la ve (no es suya ni está sin asignar) y no puede terminarla.
    expect((await tareasDe(comoCamarera)).tareas).toEqual([]);
    await comoCamarera
      .patch(`/limpieza/tareas/${tarea.id}`)
      .send({ accion: 'terminar' })
      .expect(403);
    expect(await estado()).toBe('en_limpieza');
    // Ni asigna ni crea tareas.
    await comoCamarera
      .post('/limpieza/tareas/asignar')
      .send({ tareaIds: [tarea.id], usuarioId: null })
      .expect(403);
  });

  it('asignar es todo o nada y solo con personal del hotel', async () => {
    await hacerCheckOut();
    const [tarea] = (await tareasDe(http())).tareas;
    const ajeno = await idDe(USUARIOS_PRUEBA.adminOtroHotel);
    await http()
      .post('/limpieza/tareas/asignar')
      .send({ tareaIds: [tarea.id], usuarioId: ajeno })
      .expect(404);
    await http()
      .post('/limpieza/tareas/asignar')
      .send({ tareaIds: [tarea.id, '00000000-0000-4000-8000-000000000999'], usuarioId: null })
      .expect(404);

    const camarera = await idDe(USUARIOS_PRUEBA.housekeeping);
    // Recepción ve a quién puede asignar (solo personal de su hotel); la camarera no.
    const { body: personal } = await comoRecepcionista.get('/limpieza/tareas/personal').expect(200);
    expect(personal.map((p: { id: string }) => p.id)).toContain(camarera);
    expect(personal.map((p: { id: string }) => p.id)).not.toContain(ajeno);
    await comoCamarera.get('/limpieza/tareas/personal').expect(403);
    await http()
      .post('/limpieza/tareas/asignar')
      .send({ tareaIds: [tarea.id], usuarioId: camarera })
      .expect(201);
    const { tareas } = await tareasDe(http(), { asignadaA: camarera });
    expect(tareas.map((t: { id: string }) => t.id)).toEqual([tarea.id]);
  });

  it('una tarea a mano es única por habitación, día y tipo', async () => {
    const crear = () =>
      comoRecepcionista.post('/limpieza/tareas').send({ habitacionId, tipo: 'profunda' });
    await crear().expect(201);
    const { body } = await crear().expect(409);
    expect(body.message).toMatch(/101/);
    await comoCamarera
      .post('/limpieza/tareas')
      .send({ habitacionId, tipo: 'profunda' })
      .expect(403);
  });

  it('los repasos se crean desde las 6:00 si la política está activa, sin duplicarse', async () => {
    const limpieza = app.get(LimpiezaService);
    await http().post(`/reservas/${reservaId}/check-in`).send(cuerpoCheckIn()).expect(201);
    await crearHabitacion(prisma, { numero: '102' }); // libre: no se repasa

    reloj.fijar('2030-01-02T07:00:00-05:00');
    expect(await limpieza.generarRepasos()).toEqual({ creados: 0 }); // política apagada

    await http().patch('/hotel/politicas').send({ repasoDiario: true }).expect(200);
    reloj.fijar('2030-01-02T05:50:00-05:00');
    expect(await limpieza.generarRepasos()).toEqual({ creados: 0 }); // antes de las 6

    reloj.fijar('2030-01-02T06:00:00-05:00');
    expect(await limpieza.generarRepasos()).toEqual({ creados: 1 });
    reloj.fijar('2030-01-02T06:10:00-05:00');
    expect(await limpieza.generarRepasos()).toEqual({ creados: 0 });

    const { tareas } = await tareasDe(http());
    expect(tareas).toHaveLength(1);
    expect(tareas[0]).toMatchObject({ tipo: 'repaso', habitacion: { numero: '101' } });
    // Terminar un repaso no cambia la habitación ocupada.
    await comoCamarera
      .patch(`/limpieza/tareas/${tareas[0].id}`)
      .send({ accion: 'terminar' })
      .expect(200);
    expect(await estado()).toBe('ocupada');
  });

  it('marcar lista desde el tablero cierra la tarea pendiente', async () => {
    await hacerCheckOut();
    await comoRecepcionista
      .patch(`/habitaciones/${habitacionId}/estado`)
      .send({ estado: 'libre' })
      .expect(200);
    const [tarea] = (await tareasDe(http())).tareas;
    expect(tarea.estado).toBe('terminada');

    // También en lote; y otra salida el mismo día reabre la tarea.
    reloj.fijar('2030-01-03T14:00:00-05:00');
    const otra = (
      await http()
        .post('/reservas')
        .send(cuerpoReserva(habitacionId, '2030-01-03', '2030-01-04'))
        .expect(201)
    ).body.id;
    await http().post(`/reservas/${otra}/check-in`).send(cuerpoCheckIn()).expect(201);
    await http().post(`/reservas/${otra}/check-out`).send({ medioPago: 'efectivo' }).expect(201);
    expect((await tareasDe(http())).tareas[0].estado).toBe('pendiente');
    await http()
      .post('/habitaciones/lote/estado')
      .send({ ids: [habitacionId], estado: 'libre' })
      .expect(201);
    expect((await tareasDe(http())).tareas[0].estado).toBe('terminada');
  });

  it('una incidencia que saca de servicio avisa de las reservas futuras; resolverla no la libera', async () => {
    await http()
      .post('/reservas')
      .send(cuerpoReserva(habitacionId, '2030-03-10', '2030-03-12'))
      .expect(201);
    const { body } = await comoCamarera
      .post('/incidencias')
      .send({
        habitacionId,
        descripcion: 'Gotera en el baño',
        prioridad: 'alta',
        sacaDeServicio: true,
      })
      .expect(201);
    expect(body).toMatchObject({
      estado: 'abierta',
      reportadaPor: { nombre: USUARIOS_PRUEBA.housekeeping.nombre },
      reservasAfectadas: 2,
    });
    expect(await estado()).toBe('fuera_servicio');

    // La camarera reporta, pero no resuelve.
    await comoCamarera.patch(`/incidencias/${body.id}`).send({}).expect(403);
    const { body: resuelta } = await comoRecepcionista
      .patch(`/incidencias/${body.id}`)
      .send({ solucion: 'Se cambió el sifón' })
      .expect(200);
    expect(resuelta).toMatchObject({ estado: 'resuelta', solucion: 'Se cambió el sifón' });
    expect(await estado()).toBe('fuera_servicio');
    await comoRecepcionista.patch(`/incidencias/${body.id}`).send({}).expect(409);
    expect(
      (await comoCamarera.get('/incidencias').query({ estado: 'abierta' }).expect(200)).body,
    ).toEqual([]);
  });

  it('una incidencia sin sacar de servicio deja la habitación como estaba; con huésped no la saca', async () => {
    await http().post(`/reservas/${reservaId}/check-in`).send(cuerpoCheckIn()).expect(201);
    await comoCamarera
      .post('/incidencias')
      .send({
        habitacionId,
        descripcion: 'Bombillo fundido',
        prioridad: 'baja',
        sacaDeServicio: false,
      })
      .expect(201);
    expect(await estado()).toBe('ocupada');
    const { body } = await comoCamarera
      .post('/incidencias')
      .send({ habitacionId, descripcion: 'Sin agua', prioridad: 'alta', sacaDeServicio: true })
      .expect(400);
    expect(body.message).toMatch(/huésped alojado/);
    expect(await prisma.incidencia.count()).toBe(1);
  });

  it('la camarera puede entrar con su rol, creado desde la gestión de usuarios', async () => {
    await http()
      .post('/usuarios')
      .send({
        nombre: 'Rosa Camarera',
        email: 'rosa@prueba.test',
        contrasena: 'una-contrasena-larga',
        rol: 'housekeeping',
      })
      .expect(201);
    const rosa = await prisma.usuario.findUniqueOrThrow({ where: { email: 'rosa@prueba.test' } });
    expect(rosa).toMatchObject({ rol: 'housekeeping', hotelId: HOTELES_PRUEBA.principal.id });
  });
});
