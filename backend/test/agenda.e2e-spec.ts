import { INestApplication } from '@nestjs/common';
import type TestAgent from 'supertest/lib/agent';
import { PrismaService } from '../src/prisma/prisma.service';
import { HOTEL_ANTIGUO, probarMigracion } from './migraciones';
import {
  AHORA_POR_DEFECTO,
  HOTEL_PRUEBA_ID,
  RelojFalso,
  USUARIOS_PRUEBA,
  crearApp,
  crearHabitacion,
  cuerpoCheckIn,
  cuerpoReserva,
  reiniciar,
} from './utilidades';

// S-2: agenda del spa y cupos de las experiencias. El 11 de marzo de 2030 es
// lunes. Masaje: cita de 60 minutos por edad ($100.000 adulto, $50.000 niño),
// de 08:00 a 20:00 todos los días; margen de limpieza de 15 minutos (política
// por defecto). Caminata: experiencia por persona ($30.000), 8 cupos.
describe('Agenda de servicios (S-2)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reloj: RelojFalso;
  let http: () => TestAgent; // admin
  let comoRecepcionista: TestAgent;
  let masajeId: string;
  let caminataId: string;
  let cabinaId: string;
  let reservaId: string;

  const a = (hora: string, fecha = '2030-03-11') => `${fecha}T${hora}:00-05:00`;
  let documentos = 0;
  const externo = (conPago = true) => ({
    huesped: { nombre: 'Cliente Externo', tipoDocumento: 'CC', documento: `9${++documentos}` },
    ...(conPago && { pago: { medio: 'efectivo' } }),
  });
  const agendar = (inicio: string, extra: object = externo(), recursoId = cabinaId) =>
    http()
      .post('/citas')
      .send({ servicioId: masajeId, recursoId, inicio, adultos: 1, ...extra });
  const estado = (id: string, nuevo: string, extra: object = {}) =>
    http()
      .patch(`/citas/${id}/estado`)
      .send({ estado: nuevo, ...extra });
  const folio = async () =>
    (await http().get(`/reservas/${reservaId}/folio`).expect(200)).body as {
      cargos: { concepto: string; total: string; anulado: boolean }[];
    };

  beforeAll(async () => {
    ({ app, prisma, reloj, http, comoRecepcionista } = await crearApp());
  });

  beforeEach(async () => {
    await reiniciar(prisma, reloj);
    const spa = await prisma.categoriaServicio.create({
      data: { hotelId: HOTEL_PRUEBA_ID, nombre: 'Spa', clasificacion: 'spa' },
    });
    const salidas = await prisma.categoriaServicio.create({
      data: { hotelId: HOTEL_PRUEBA_ID, nombre: 'Experiencias', clasificacion: 'experiencia' },
    });
    masajeId = (
      await prisma.servicio.create({
        data: {
          hotelId: HOTEL_PRUEBA_ID,
          codigo: 'masaje',
          nombre: 'Masaje',
          categoriaId: spa.id,
          tipo: 'cita',
          modoPrecio: 'por_edad',
          precio: 100000,
          precioNino: 50000,
          duracionMinutos: 60,
          disponibilidad: { dias: [1, 2, 3, 4, 5, 6, 7], desde: '08:00', hasta: '20:00' },
        },
      })
    ).id;
    caminataId = (
      await prisma.servicio.create({
        data: {
          hotelId: HOTEL_PRUEBA_ID,
          codigo: 'caminata',
          nombre: 'Caminata',
          categoriaId: salidas.id,
          tipo: 'experiencia',
          modoPrecio: 'por_persona',
          precio: 30000,
          duracionMinutos: 120,
          cuposPorSalida: 8,
        },
      })
    ).id;
    cabinaId = (
      await http()
        .post('/agenda/recursos')
        .send({ nombre: 'Cabina 1', servicioIds: [masajeId] })
        .expect(201)
    ).body.id;

    // Una estadía activa del 10 al 14 de marzo.
    const habitacion = await crearHabitacion(prisma);
    reservaId = (
      await http()
        .post('/reservas')
        .send(cuerpoReserva(habitacion.id, '2030-03-10', '2030-03-14'))
        .expect(201)
    ).body.id;
    reloj.fijar(a('15:00', '2030-03-10'));
    await http().post(`/reservas/${reservaId}/check-in`).send(cuerpoCheckIn()).expect(201);
    reloj.fijar(a('07:00'));
  });

  afterAll(async () => {
    reloj.fijar(AHORA_POR_DEFECTO);
    await app.close();
  });

  describe('citas sin cruces', () => {
    it('bajo concurrencia, de 10 citas cruzadas en el mismo recurso solo una gana', async () => {
      // Horas escalonadas (10:00, 10:05…): todas se cruzan entre sí sin ser iguales.
      const respuestas = await Promise.all(
        Array.from({ length: 10 }, (_, i) => agendar(a(`10:${String(i * 5).padStart(2, '0')}`))),
      );
      const estados = respuestas.map((r) => r.status);
      expect(estados.filter((s) => s === 201)).toHaveLength(1);
      expect(estados.filter((s) => s === 409)).toHaveLength(9);
      expect(await prisma.citaServicio.count()).toBe(1);
    });

    it('la base de datos rechaza el cruce aunque se salte la verificación previa', async () => {
      // Como en la no-sobreventa: 10 inserciones directas y simultáneas, sin el servicio.
      const huesped = await prisma.huesped.create({
        data: {
          hotelId: HOTEL_PRUEBA_ID,
          nombre: 'Directo',
          primerNombre: 'Directo',
          documento: '77',
        },
      });
      const admin = await prisma.usuario.findUniqueOrThrow({
        where: { email: USUARIOS_PRUEBA.admin.email },
      });
      const inicio = new Date(a('10:00'));
      const resultados = await Promise.allSettled(
        Array.from({ length: 10 }, (_, i) =>
          prisma.citaServicio.create({
            data: {
              hotelId: HOTEL_PRUEBA_ID,
              servicioId: masajeId,
              recursoId: cabinaId,
              huespedId: huesped.id,
              inicio: new Date(inicio.getTime() + i * 60000),
              fin: new Date(inicio.getTime() + (60 + i) * 60000),
              finOcupado: new Date(inicio.getTime() + (75 + i) * 60000),
              valor: 100000,
              concepto: 'Masaje',
              usuarioId: admin.id,
            },
          }),
        ),
      );
      expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      // Las demás las rechaza la restricción (23P01) o PostgreSQL resuelve la
      // carrera como un interbloqueo (40P01): en ningún caso entra una segunda.
      for (const r of resultados.filter((r) => r.status === 'rejected')) {
        expect(String((r as PromiseRejectedResult).reason)).toMatch(/code: "(23P01|40P01)"/);
      }
      expect(await prisma.citaServicio.count()).toBe(1);
    });

    it('una cita que empieza justo después del margen se permite; con un minuto de cruce, no', async () => {
      await agendar(a('09:00')).expect(201); // ocupa la cabina hasta las 10:15
      await agendar(a('10:14')).expect(409);
      await agendar(a('10:15')).expect(201);
      // Antes: la nueva (con su margen) tampoco puede pisar la de las 09:00.
      await agendar(a('07:45')).expect(400); // fuera del horario
      await agendar(a('08:00')).expect(409); // terminaría con margen a las 09:15
    });

    it('una cita cancelada libera el hueco', async () => {
      const cita = (await agendar(a('10:00')).expect(201)).body;
      await agendar(a('10:30')).expect(409);
      await estado(cita.id, 'cancelada').expect(200);
      await agendar(a('10:30')).expect(201);
    });

    it('fuera del horario del servicio o en el pasado → 400', async () => {
      const res = await agendar(a('19:30')).expect(400); // terminaría a las 20:30
      expect(res.body.message).toMatch(/horario/);
      await agendar(a('06:00')).expect(400);
    });

    it('muestra los huecos libres del día por recurso', async () => {
      await agendar(a('10:00')).expect(201);
      const { body } = await http()
        .get('/agenda/disponibilidad')
        .query({ servicioId: masajeId, fecha: '2030-03-11' })
        .expect(200);
      const horas = body[0].huecos.map((h: { inicio: string }) => h.inicio);
      expect(horas).toContain(new Date(a('08:45')).toISOString()); // hasta 10:00 justo
      expect(horas).not.toContain(new Date(a('09:00')).toISOString());
      expect(horas).toContain(new Date(a('11:15')).toISOString());
      const agenda = await http().get('/agenda').query({ fecha: '2030-03-11' }).expect(200);
      expect(agenda.body.citas).toHaveLength(1);
      expect(agenda.body.recursos.map((r: { nombre: string }) => r.nombre)).toEqual(['Cabina 1']);
    });
  });

  describe('cobro', () => {
    it('al_prestar: el cargo entra al folio al marcarla realizada, con el precio por edad', async () => {
      const cita = (
        await agendar(a('10:00'), { reservaId, adultos: 1, edadesNinos: [6] }).expect(201)
      ).body;
      expect((await folio()).cargos).toHaveLength(0);
      await estado(cita.id, 'en_curso').expect(200);
      await estado(cita.id, 'realizada').expect(200);
      const { cargos } = await folio();
      expect(cargos.map((c) => [c.concepto, Number(c.total)])).toEqual([
        ['Masaje (1 adulto, 1 niño)', 150000],
      ]);
      await estado(cita.id, 'cancelada').expect(409); // ya se prestó
    });

    it('al_agendar: el cargo entra al confirmar la cita', async () => {
      await http().patch('/hotel/politicas').send({ cobroServicios: 'al_agendar' }).expect(200);
      const cita = (await agendar(a('10:00'), { reservaId }).expect(201)).body;
      expect((await folio()).cargos.map((c) => Number(c.total))).toEqual([100000]);
      // Realizarla no la cobra otra vez.
      await estado(cita.id, 'realizada').expect(200);
      expect((await folio()).cargos).toHaveLength(1);
    });

    it('un huésped externo paga en el momento; sin pago → 400', async () => {
      const res = await agendar(a('10:00'), externo(false)).expect(400);
      expect(res.body.message).toMatch(/pago/);
      const cita = (await agendar(a('10:00')).expect(201)).body;
      const pagos = await prisma.pago.findMany({ where: { citaId: cita.id } });
      expect(pagos.map((p) => [p.tipo, Number(p.monto), p.reservaId])).toEqual([
        ['abono', 100000, null],
      ]);
    });

    it('cancelar tarde cobra el porcentaje: penalidad en el folio y reembolso de lo pagado', async () => {
      await http()
        .patch('/hotel/politicas')
        .send({ cobroServicios: 'al_agendar', porcentajeCancelacionServicio: 50 })
        .expect(200);
      const delHuesped = (await agendar(a('10:00'), { reservaId }).expect(201)).body;
      const deExterno = (await agendar(a('12:00')).expect(201)).body;

      reloj.fijar(a('09:00')); // a 1 hora: menos de las 4 de la política
      await estado(delHuesped.id, 'cancelada').expect(200);
      const { cargos } = await folio();
      expect(cargos.map((c) => [c.concepto, Number(c.total), c.anulado])).toEqual([
        ['Masaje (1 adulto)', 100000, true],
        ['Penalidad por cancelar: Masaje (1 adulto)', 50000, false],
      ]);

      await estado(deExterno.id, 'no_asistio').expect(200);
      const pagos = await prisma.pago.findMany({
        where: { citaId: deExterno.id },
        orderBy: { fecha: 'asc' },
      });
      expect(pagos.map((p) => [p.tipo, Number(p.monto)])).toEqual([
        ['abono', 100000],
        ['reembolso', 50000],
      ]);
    });

    it('cancelar a tiempo no cobra nada y devuelve todo', async () => {
      await http()
        .patch('/hotel/politicas')
        .send({ porcentajeCancelacionServicio: 50 })
        .expect(200);
      const cita = (await agendar(a('18:00')).expect(201)).body; // a 11 horas
      await estado(cita.id, 'cancelada').expect(200);
      const pagos = await prisma.pago.findMany({ where: { citaId: cita.id } });
      expect(pagos.map((p) => [p.tipo, Number(p.monto)]).sort()).toEqual([
        ['abono', 100000],
        ['reembolso', 100000],
      ]);
    });
  });

  describe('cupos de las experiencias', () => {
    const crearSalida = async (extra: object = {}) =>
      (
        await http()
          .post('/salidas')
          .send({ servicioId: caminataId, inicio: a('09:00', '2030-03-12'), ...extra })
          .expect(201)
      ).body as { id: string; cupos: number }[];
    const tomar = (salidaId: string, cuerpo: object) =>
      http().post(`/salidas/${salidaId}/cupos`).send(cuerpo);

    it('bajo concurrencia, 5 pedidos de 2 personas en 8 cupos: entran 4', async () => {
      const [salida] = await crearSalida();
      expect(salida.cupos).toBe(8);
      const respuestas = await Promise.all(
        Array.from({ length: 5 }, () => tomar(salida.id, { cantidad: 2, ...externo() })),
      );
      expect(respuestas.filter((r) => r.status === 201)).toHaveLength(4);
      expect(respuestas.filter((r) => r.status === 409)).toHaveLength(1);
      const { _sum } = await prisma.cupoExperiencia.aggregate({
        where: { salidaId: salida.id, estado: 'vigente' },
        _sum: { personas: true },
      });
      expect(_sum.personas).toBe(8);
    });

    it('la repetición semanal crea las salidas en una sola vez', async () => {
      const salidas = await crearSalida({ repetirSemanas: 2 });
      expect(salidas).toHaveLength(3);
      const { body } = await http()
        .get('/salidas')
        .query({ desde: '2030-03-11', hasta: '2030-03-31' })
        .expect(200);
      expect(body.map((s: { inicio: string }) => s.inicio.slice(0, 10))).toEqual([
        '2030-03-12',
        '2030-03-19',
        '2030-03-26',
      ]);
    });

    it('al_prestar: la salida realizada carga los cupos de los huéspedes alojados', async () => {
      const [salida] = await crearSalida();
      const cupo = (await tomar(salida.id, { reservaId, cantidad: 3 }).expect(201)).body;
      expect(cupo.cargoId).toBeNull();
      await http().patch(`/salidas/${salida.id}/estado`).send({ estado: 'realizada' }).expect(200);
      expect((await folio()).cargos.map((c) => [c.concepto, Number(c.total)])).toEqual([
        ['Caminata (3 personas)', 90000],
      ]);
      const listado = await http().get('/salidas').query({ desde: '2030-03-12' }).expect(200);
      expect(listado.body[0]).toMatchObject({ estado: 'realizada', ocupados: 3, libres: 5 });
    });

    it('cancelar un cupo libera sus personas', async () => {
      const [salida] = await crearSalida({ cupos: 2 });
      const cupo = (await tomar(salida.id, { cantidad: 2, ...externo() }).expect(201)).body;
      await tomar(salida.id, { cantidad: 1, ...externo() }).expect(409);
      await http().post(`/cupos/${cupo.id}/cancelar`).expect(200);
      await tomar(salida.id, { cantidad: 2, ...externo() }).expect(201);
    });
  });

  describe('permisos', () => {
    it('recepción agenda, pero los recursos y las salidas los configura el admin', async () => {
      await comoRecepcionista
        .post('/citas')
        .send({
          servicioId: masajeId,
          recursoId: cabinaId,
          inicio: a('10:00'),
          adultos: 1,
          ...externo(),
        })
        .expect(201);
      await comoRecepcionista.post('/agenda/recursos').send({ nombre: 'Cabina 2' }).expect(403);
      await comoRecepcionista
        .post('/salidas')
        .send({ servicioId: caminataId, inicio: a('09:00', '2030-03-12') })
        .expect(403);
    });

    it('la cita de una reserva debe caer dentro de su estadía', async () => {
      await agendar(a('10:00', '2030-03-20'), { reservaId }).expect(400);
    });

    it('las citas y cupos de una reserva se ven en su detalle', async () => {
      await agendar(a('10:00'), { reservaId }).expect(201);
      const { body } = await http().get(`/agenda/reservas/${reservaId}`).expect(200);
      expect(body.citas).toHaveLength(1);
      expect(body.cupos).toEqual([]);
    });
  });
});

describe('Migración agenda_de_servicios', () => {
  it('los pagos existentes conservan su reserva y un pago sin dueño se rechaza', async () => {
    await probarMigracion(
      '20261103000000_agenda_de_servicios',
      [
        // HOTEL_ANTIGUO es anterior al cargo por niño (adultos_y_ninos): aquí ya existe.
        HOTEL_ANTIGUO[0],
        `INSERT INTO tipo_habitacion (id, hotel_id, codigo, nombre, tarifa_base, capacidad_incluida, capacidad_maxima, cargo_persona_adicional, cargo_nino_adicional)
         VALUES ('t1', 'h1', 'doble', 'Doble', 100000, 2, 3, 30000, 15000)`,
        HOTEL_ANTIGUO[2],
        `INSERT INTO huesped (id, hotel_id, nombre, primer_nombre, documento) VALUES ('g1', 'h1', 'Ana', 'Ana', '111')`,
        `INSERT INTO reserva (id, hotel_id, habitacion_id, huesped_id, fecha_entrada, fecha_salida, estado, valor_alojamiento)
         VALUES ('r1', 'h1', 'c1', 'g1', '2026-01-10', '2026-01-12', 'confirmada', 200000)`,
        `INSERT INTO pago (id, hotel_id, reserva_id, tipo, medio, monto) VALUES ('p1', 'h1', 'r1', 'anticipo', 'efectivo', 60000)`,
      ],
      async (cliente) => {
        const pagos = await cliente.$queryRawUnsafe<{ reserva: string; cita: string | null }[]>(
          `SELECT reserva_id AS reserva, cita_id AS cita FROM pago`,
        );
        expect(pagos).toEqual([{ reserva: 'r1', cita: null }]);
        await expect(
          cliente.$executeRawUnsafe(
            `INSERT INTO pago (id, hotel_id, tipo, medio, monto) VALUES ('p2', 'h1', 'abono', 'efectivo', 1)`,
          ),
        ).rejects.toThrow(/pago_de_una_cosa/);
      },
    );
  });
});
