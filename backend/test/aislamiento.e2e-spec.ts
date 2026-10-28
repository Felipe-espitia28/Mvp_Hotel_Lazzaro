import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { PrismaService } from '../src/prisma/prisma.service';
import { eventoSimulado } from '../src/pagos-en-linea/pasarela-simulada.adaptador';
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

    // B-1: los indicadores del negocio tampoco cuentan las reservas de otro hotel.
    const gerencia = await comoOtroHotel
      .get('/panel/gerencia')
      .query({ desde: '2030-03-01', hasta: '2030-03-31' })
      .expect(200);
    expect([gerencia.body.actual.nochesVendidas, gerencia.body.actual.ingresoAlojamiento]).toEqual([
      0, 0,
    ]);
    expect(gerencia.body.cuentasPorCobrar.cuentas).toEqual([]);
    const pickup = await comoOtroHotel.get('/panel/pickup').expect(200);
    expect(pickup.body.reservas).toBe(0);
    const pronostico = await comoOtroHotel.get('/panel/pronostico').expect(200);
    expect(pronostico.body.serie.every((n: { ocupadas: number }) => n.ocupadas === 0)).toBe(true);
  });

  it('no puede ver ni operar una reserva de otro hotel (404)', async () => {
    reloj.fijar('2030-03-10T15:00:00-05:00');
    await comoOtroHotel.get(`/reservas/${reservaId}/historial`).expect(404);
    await comoOtroHotel.get(`/reservas/${reservaId}/folio`).expect(404);
    await comoOtroHotel.post(`/reservas/${reservaId}/check-in`).send(REGISTRO).expect(404);
    await comoOtroHotel.post(`/reservas/${reservaId}/cancelar`).expect(404);
    // A-5: tampoco la modifica ni la cotiza.
    await comoOtroHotel
      .patch(`/reservas/${reservaId}`)
      .send({ fechaSalida: '2030-03-13' })
      .expect(404);
    await comoOtroHotel
      .post(`/reservas/${reservaId}/cotizar-modificacion`)
      .send({ fechaSalida: '2030-03-13' })
      .expect(404);

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
    // A-4: ni en lote ni con un rango de su tipo.
    await comoOtroHotel
      .post('/habitaciones/lote/estado')
      .send({ ids: [habitacionId], estado: 'fuera_servicio' })
      .expect(404);
    await comoOtroHotel
      .post('/habitaciones/rango')
      .send({ desde: '901', hasta: '902', tipoId })
      .expect(404);
    expect(
      (await prisma.habitacion.findUniqueOrThrow({ where: { id: habitacionId } })).estado,
    ).toBe('libre');
  });

  it('no ve ni cambia el catálogo de servicios de otro hotel (S-1)', async () => {
    const { body: categoria } = await http()
      .post('/servicios/categorias')
      .send({ nombre: 'Spa', clasificacion: 'spa' })
      .expect(201);
    const { body: atributo } = await http()
      .post(`/servicios/categorias/${categoria.id}/atributos`)
      .send({ etiqueta: 'Requiere cita previa', tipo: 'si_no' })
      .expect(201);
    const { body: servicio } = await http()
      .post('/servicios')
      .send({ nombre: 'Masaje', categoriaId: categoria.id, precio: 100000 })
      .expect(201);

    expect((await comoOtroHotel.get('/servicios').expect(200)).body).toEqual([]);
    expect((await comoOtroHotel.get('/servicios/categorias').expect(200)).body).toEqual([]);
    await comoOtroHotel
      .patch(`/servicios/categorias/${categoria.id}`)
      .send({ activa: false })
      .expect(404);
    await comoOtroHotel
      .patch(`/servicios/categorias/${categoria.id}/atributos/${atributo.id}`)
      .send({ obligatorio: true })
      .expect(404);
    await comoOtroHotel.patch(`/servicios/${servicio.id}`).send({ activo: false }).expect(404);
    // Plan 09: ni su plantilla ni importar en su categoría.
    await comoOtroHotel.get(`/servicios/categorias/${categoria.id}/plantilla`).expect(404);
    await comoOtroHotel
      .post(`/servicios/categorias/${categoria.id}/importar`)
      .send({ filas: [{ codigo: 'masaje', precio: '1' }] })
      .expect(404);
    // Tampoco lo carga al folio de una reserva suya.
    await comoOtroHotel
      .post(`/reservas/${reservaId}/cargos`)
      .send({ servicioId: servicio.id, cantidad: 1 })
      .expect(404);
    expect((await prisma.servicio.findUniqueOrThrow({ where: { id: servicio.id } })).activo).toBe(
      true,
    );
  });

  it('no ve ni toca la agenda, los recursos, las citas ni las salidas de otro hotel (S-2)', async () => {
    const categoria = await prisma.categoriaServicio.create({
      data: { hotelId: HOTELES_PRUEBA.principal.id, nombre: 'Spa', clasificacion: 'spa' },
    });
    const servicio = (tipo: 'cita' | 'experiencia', codigo: string) =>
      prisma.servicio.create({
        data: {
          hotelId: HOTELES_PRUEBA.principal.id,
          codigo,
          nombre: codigo,
          categoriaId: categoria.id,
          tipo,
          modoPrecio: 'por_persona',
          precio: 50000,
          duracionMinutos: 60,
          cuposPorSalida: 4,
        },
      });
    const masaje = await servicio('cita', 'masaje');
    const caminata = await servicio('experiencia', 'caminata');
    const { body: recurso } = await http()
      .post('/agenda/recursos')
      .send({ nombre: 'Cabina 1', servicioIds: [masaje.id] })
      .expect(201);
    const { body: cita } = await http()
      .post('/citas')
      .send({
        servicioId: masaje.id,
        recursoId: recurso.id,
        inicio: '2030-03-11T10:00:00-05:00',
        reservaId,
        cantidad: 1,
        // La reserva aún no tiene check-in: sin folio, se paga en el momento.
        pago: { medio: 'efectivo' },
      })
      .expect(201);
    const {
      body: [salida],
    } = await http()
      .post('/salidas')
      .send({ servicioId: caminata.id, inicio: '2030-03-11T09:00:00-05:00' })
      .expect(201);
    const { body: cupo } = await http()
      .post(`/salidas/${salida.id}/cupos`)
      .send({ reservaId, cantidad: 1, pago: { medio: 'efectivo' } })
      .expect(201);

    expect((await comoOtroHotel.get('/agenda/recursos').expect(200)).body).toEqual([]);
    const agenda = await comoOtroHotel.get('/agenda').query({ fecha: '2030-03-11' }).expect(200);
    expect(agenda.body.citas).toEqual([]);
    expect(
      (await comoOtroHotel.get('/salidas').query({ desde: '2030-03-01' }).expect(200)).body,
    ).toEqual([]);
    await comoOtroHotel.patch(`/agenda/recursos/${recurso.id}`).send({ activo: false }).expect(404);
    await comoOtroHotel.patch(`/citas/${cita.id}/estado`).send({ estado: 'cancelada' }).expect(404);
    await comoOtroHotel
      .get('/agenda/disponibilidad')
      .query({ servicioId: masaje.id, fecha: '2030-03-11' })
      .expect(404);
    await comoOtroHotel.get(`/agenda/reservas/${reservaId}`).expect(404);
    await comoOtroHotel
      .post(`/salidas/${salida.id}/cupos`)
      .send({ reservaId, cantidad: 1 })
      .expect(404);
    await comoOtroHotel
      .patch(`/salidas/${salida.id}/estado`)
      .send({ estado: 'cancelada' })
      .expect(404);
    await comoOtroHotel.post(`/cupos/${cupo.id}/cancelar`).expect(404);
    expect((await prisma.citaServicio.findUniqueOrThrow({ where: { id: cita.id } })).estado).toBe(
      'agendada',
    );
  });

  it('no ve ni cierra los turnos de caja de otro hotel (B-3)', async () => {
    const { body: turno } = await http()
      .post('/turnos/abrir')
      .send({ baseEfectivo: 100000 })
      .expect(201);
    await http()
      .post(`/reservas/${reservaId}/pagos`)
      .send({ tipo: 'anticipo', medio: 'efectivo', monto: 10000 })
      .expect(201);

    expect((await comoOtroHotel.get('/turnos').expect(200)).body).toEqual([]);
    expect((await comoOtroHotel.get('/turnos/sin-turno').expect(200)).body.pagos).toEqual([]);
    expect((await comoOtroHotel.get('/turnos/actual').expect(200)).body.turno).toBeNull();
    await comoOtroHotel.post(`/turnos/${turno.id}/cerrar`).send({ efectivoContado: 0 }).expect(404);
    expect(
      (await prisma.turno.findUniqueOrThrow({ where: { id: turno.id } })).cerradoEn,
    ).toBeNull();
  });

  it('no ve ni crea links de pago de otro hotel, y su webhook no aprueba los intentos ajenos (B-2)', async () => {
    const { body: intento } = await http()
      .post(`/reservas/${reservaId}/link-de-pago`)
      .send({})
      .expect(201);
    await comoOtroHotel.post(`/reservas/${reservaId}/link-de-pago`).send({}).expect(404);
    await comoOtroHotel.get(`/reservas/${reservaId}/intentos-de-pago`).expect(404);

    // Un evento válido para esa referencia, pero entregado en el webhook del otro hotel.
    const evento = eventoSimulado(
      {
        id: 'sim-ajeno',
        referencia: intento.referencia,
        montoEnCentavos: 4800000,
        moneda: 'COP',
        estado: 'aprobada',
      },
      new Date(),
    );
    await request(app.getHttpServer())
      .post(`/webhooks/wompi/${HOTELES_PRUEBA.otro.slug}`)
      .send(evento)
      .expect(200);
    expect((await prisma.intentoPago.findUniqueOrThrow({ where: { id: intento.id } })).estado).toBe(
      'creado',
    );
    expect(await prisma.pago.count({ where: { reservaId } })).toBe(0);
  });

  it('no ve ni toca las tareas de limpieza ni las incidencias de otro hotel (B-4)', async () => {
    const { body: tarea } = await http()
      .post('/limpieza/tareas')
      .send({ habitacionId, tipo: 'profunda' })
      .expect(201);
    const { body: incidencia } = await http()
      .post('/incidencias')
      .send({ habitacionId, descripcion: 'Gotera', prioridad: 'media', sacaDeServicio: false })
      .expect(201);

    expect((await comoOtroHotel.get('/limpieza/tareas').expect(200)).body.tareas).toEqual([]);
    expect((await comoOtroHotel.get('/incidencias').expect(200)).body).toEqual([]);
    await comoOtroHotel
      .patch(`/limpieza/tareas/${tarea.id}`)
      .send({ accion: 'iniciar' })
      .expect(404);
    await comoOtroHotel
      .post('/limpieza/tareas/asignar')
      .send({ tareaIds: [tarea.id], usuarioId: null })
      .expect(404);
    await comoOtroHotel.post('/limpieza/tareas').send({ habitacionId, tipo: 'repaso' }).expect(404);
    await comoOtroHotel
      .post('/incidencias')
      .send({ habitacionId, descripcion: 'x', prioridad: 'baja', sacaDeServicio: true })
      .expect(404);
    await comoOtroHotel.patch(`/incidencias/${incidencia.id}`).send({}).expect(404);
    expect(
      (await prisma.habitacion.findUniqueOrThrow({ where: { id: habitacionId } })).estado,
    ).toBe('libre');
  });

  it('no ve ni usa las empresas de otro hotel (B-5)', async () => {
    const { body: empresa } = await http()
      .post('/empresas')
      .send({ nit: '900123456', razonSocial: 'Viajes Andinos', email: 'f@va.co', credito: true })
      .expect(201);
    await http()
      .patch(`/reservas/${reservaId}/empresa`)
      .send({ empresaId: empresa.id })
      .expect(200);

    expect((await comoOtroHotel.get('/empresas').expect(200)).body).toEqual([]);
    await comoOtroHotel.get(`/empresas/${empresa.id}/estado-de-cuenta`).expect(404);
    await comoOtroHotel.patch(`/empresas/${empresa.id}`).send({ credito: false }).expect(404);
    await comoOtroHotel
      .post(`/empresas/${empresa.id}/abonos`)
      .send({ pagos: [{ reservaId, monto: 1000 }], medio: 'efectivo' })
      .expect(404);
    await comoOtroHotel
      .patch(`/reservas/${reservaId}/empresa`)
      .send({ empresaId: null })
      .expect(404);
    // El mismo NIT puede existir en otro hotel, pero no se asigna a una reserva ajena.
    const { body: suya } = await comoOtroHotel
      .post('/empresas')
      .send({ nit: '900123456', razonSocial: 'Viajes Andinos', email: 'f@va.co' })
      .expect(201);
    await http().patch(`/reservas/${reservaId}/empresa`).send({ empresaId: suya.id }).expect(404);
    expect(await prisma.pago.count()).toBe(0);
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
