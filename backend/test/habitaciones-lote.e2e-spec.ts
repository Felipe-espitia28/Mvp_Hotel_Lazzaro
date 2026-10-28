import { INestApplication } from '@nestjs/common';
import type TestAgent from 'supertest/lib/agent';
import { PrismaService } from '../src/prisma/prisma.service';
import { HOTEL_ANTIGUO, probarMigracion } from './migraciones';
import {
  HOTEL_PRUEBA_ID,
  HOTELES_PRUEBA,
  RelojFalso,
  crearApp,
  crearHabitacion,
  cuerpoCheckIn,
  cuerpoReserva,
  reiniciar,
} from './utilidades';

// A-4 / R52: crear un rango, importar filas de un archivo y cambiar muchas
// habitaciones a la vez. Todo o nada, y nunca se borra.
describe('Habitaciones en lote (A-4)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reloj: RelojFalso;
  let http: () => TestAgent;
  let comoOtroHotel: TestAgent;
  let tipoId: string;

  beforeAll(async () => {
    ({ app, prisma, reloj, http, comoOtroHotel } = await crearApp());
  });

  beforeEach(async () => {
    await reiniciar(prisma, reloj);
    // La 001 deja creado el tipo "prueba-80000" (hasta 4 huéspedes).
    tipoId = (await crearHabitacion(prisma, { numero: '001' })).tipoHabitacionId;
  });

  afterAll(async () => {
    await app.close();
  });

  const crearTipo = (codigo: string, capacidadMaxima: number) =>
    prisma.tipoHabitacion.create({
      data: {
        hotelId: HOTEL_PRUEBA_ID,
        codigo,
        nombre: codigo === 'suite' ? 'Suite' : 'Sencilla',
        tarifaBase: 100000,
        capacidadIncluida: 1,
        capacidadMaxima,
        cargoPersonaAdicional: 0,
        cargoNinoAdicional: 0,
      },
    });
  const numeros = async () =>
    (
      await prisma.habitacion.findMany({
        where: { hotelId: HOTEL_PRUEBA_ID },
        orderBy: { numero: 'asc' },
      })
    ).map((h) => h.numero);
  const importar = (filas: object[], soloValidar = false) =>
    http()
      .post(`/habitaciones/importar${soloValidar ? '?soloValidar=true' : ''}`)
      .send({ filas });

  it('un rango de 101 a 120 crea 20, con el piso del número', async () => {
    const { body } = await http()
      .post('/habitaciones/rango')
      .send({ desde: '101', hasta: '120', tipoId })
      .expect(201);

    expect(body.creadas).toBe(20);
    const creadas = await prisma.habitacion.findMany({ where: { numero: { gte: '101' } } });
    expect(creadas).toHaveLength(20);
    expect(new Set(creadas.map((h) => h.piso))).toEqual(new Set([1]));
  });

  it('el prefijo y el piso explícito se aplican a todo el rango', async () => {
    await http()
      .post('/habitaciones/rango')
      .send({ desde: '01', hasta: '03', tipoId, prefijo: 'C-', piso: 0 })
      .expect(201);
    expect(await numeros()).toEqual(['001', 'C-01', 'C-02', 'C-03']);
  });

  it('un rango con un número ya existente no crea ninguna', async () => {
    await crearHabitacion(prisma, { numero: '105' });

    const { body } = await http()
      .post('/habitaciones/rango')
      .send({ desde: '101', hasta: '110', tipoId })
      .expect(409);

    expect(body.message).toContain('105');
    expect(await numeros()).toEqual(['001', '105']);
  });

  it('con soloValidar, una fila mala aparece en el informe y nada se guarda', async () => {
    const filas = [
      { ' Número ': '201', TIPO: 'PRUEBA-80000', Piso: '2', Descripción: 'Vista al mar' },
      { ' Número ': '', TIPO: '', Piso: '', Descripción: '' }, // vacía: se ignora
      { ' Número ': '202', TIPO: 'no-existe', Piso: 'dos', Descripción: '' },
      { ' Número ': '001', TIPO: 'prueba-80000', Piso: '', Descripción: 'Junto al lobby' },
    ];

    const { body } = await importar(filas, true).expect(200);

    expect(body.resumen).toEqual({ total: 3, crear: 1, actualizar: 1, error: 1 });
    expect(body.filas[1]).toMatchObject({ fila: 4, numero: '202', estado: 'error' });
    expect(body.filas[1].errores).toEqual([
      expect.stringContaining('No existe el tipo "no-existe"'),
      'El piso debe ser un número entero',
    ]);
    expect(await numeros()).toEqual(['001']);

    // Sin soloValidar: 400 con el mismo informe, y tampoco se guarda nada.
    const aplicado = await importar(filas).expect(400);
    expect(aplicado.body.informe.resumen.error).toBe(1);
    expect(await numeros()).toEqual(['001']);
    const existente = await prisma.habitacion.findFirstOrThrow({ where: { numero: '001' } });
    expect(existente.descripcion).toBeNull();
  });

  it('una importación crea las nuevas y actualiza las existentes sin borrar lo que no viene', async () => {
    const suite = await crearTipo('suite', 4);
    await prisma.habitacion.update({
      where: { hotelId_numero: { hotelId: HOTEL_PRUEBA_ID, numero: '001' } },
      data: { descripcion: 'Junto al lobby' },
    });

    const { body } = await importar([
      { numero: '001', tipo: 'SUITE', piso: '0' },
      { numero: '301', tipo: 'suite', piso: '', descripcion: 'Jacuzzi' },
    ]).expect(201);

    expect(body.resumen).toMatchObject({ crear: 1, actualizar: 1, error: 0 });
    const [primera, nueva] = await prisma.habitacion.findMany({ orderBy: { numero: 'asc' } });
    expect(primera).toMatchObject({ tipoHabitacionId: suite.id, piso: 0 });
    expect(primera.descripcion).toBe('Junto al lobby');
    expect(nueva).toMatchObject({ numero: '301', piso: 3, descripcion: 'Jacuzzi' });
  });

  it('un número repetido en el archivo es un error de la segunda fila', async () => {
    const { body } = await importar(
      [
        { numero: '401', tipo: 'prueba-80000' },
        { numero: '401', tipo: 'prueba-80000' },
      ],
      true,
    ).expect(200);
    expect(body.filas[1].errores).toEqual(['El número 401 está repetido en el archivo (fila 2)']);
  });

  it('el lote de estado da el aviso agrupado de las reservas por reubicar', async () => {
    const ids = [];
    for (const numero of ['501', '502', '503', '504', '505']) {
      ids.push((await crearHabitacion(prisma, { numero })).id);
    }
    await http()
      .post('/reservas')
      .send(cuerpoReserva(ids[2], '2030-03-10', '2030-03-12'));
    await http()
      .post('/reservas')
      .send(cuerpoReserva(ids[2], '2030-04-10', '2030-04-12'));

    const { body } = await http()
      .post('/habitaciones/lote/estado')
      .send({ ids, estado: 'fuera_servicio' })
      .expect(201);

    expect(body).toEqual({
      actualizadas: 5,
      avisos: { reservasFuturas: [{ numero: '503', reservas: 2 }], total: 2 },
    });
    const estados = await prisma.habitacion.findMany({ where: { id: { in: ids } } });
    expect(estados.every((h) => h.estado === 'fuera_servicio')).toBe(true);
  });

  it('el lote de estado con una habitación ocupada no cambia ninguna', async () => {
    const libre = await crearHabitacion(prisma, { numero: '601' });
    const ocupada = await crearHabitacion(prisma, { numero: '602' });
    reloj.fijar('2030-03-10T15:00:00-05:00');
    const reserva = await http()
      .post('/reservas')
      .send(cuerpoReserva(ocupada.id, '2030-03-10', '2030-03-12'))
      .expect(201);
    await http().post(`/reservas/${reserva.body.id}/check-in`).send(cuerpoCheckIn()).expect(201);

    const { body } = await http()
      .post('/habitaciones/lote/estado')
      .send({ ids: [libre.id, ocupada.id], estado: 'fuera_servicio' })
      .expect(400);

    expect(body.message).toContain('602');
    expect((await prisma.habitacion.findUniqueOrThrow({ where: { id: libre.id } })).estado).toBe(
      'libre',
    );
  });

  it('cambia el tipo en lote; no a uno con menos cupo que una reserva (R53)', async () => {
    const sencilla = await crearTipo('sencilla', 2);
    const suite = await crearTipo('suite', 4);
    const a = await crearHabitacion(prisma, { numero: '701' });
    const b = await crearHabitacion(prisma, { numero: '702' });
    await http()
      .post('/reservas')
      .send({ ...cuerpoReserva(b.id, '2030-03-10', '2030-03-12'), adultos: 3 })
      .expect(201);

    const rechazo = await http()
      .post('/habitaciones/lote/tipo')
      .send({ ids: [a.id, b.id], tipoId: sencilla.id })
      .expect(400);
    expect(rechazo.body.message).toBe(
      'La habitación 702 tiene una reserva de 3 huéspedes y el tipo Sencilla admite hasta 2: no se cambió ninguna',
    );
    expect(
      (await prisma.habitacion.findUniqueOrThrow({ where: { id: a.id } })).tipoHabitacionId,
    ).toBe(tipoId);

    // A una suite sí: la reserva conserva su precio pactado y se avisa.
    const reserva = await prisma.reserva.findFirstOrThrow({ where: { habitacionId: b.id } });
    const { body } = await http()
      .post('/habitaciones/lote/tipo')
      .send({ ids: [a.id, b.id], tipoId: suite.id })
      .expect(201);
    expect(body).toEqual({
      actualizadas: 2,
      avisos: { reservasFuturas: [{ numero: '702', reservas: 1 }], total: 1 },
    });
    const despues = await prisma.reserva.findUniqueOrThrow({ where: { id: reserva.id } });
    expect(despues.total).toEqual(reserva.total);
  });

  it('la importación tampoco deja una reserva sin cupo al cambiar el tipo', async () => {
    await crearTipo('sencilla', 2);
    const h = await crearHabitacion(prisma, { numero: '801' });
    await http()
      .post('/reservas')
      .send({ ...cuerpoReserva(h.id, '2030-03-10', '2030-03-12'), adultos: 3 })
      .expect(201);

    const { body } = await importar([{ numero: '801', tipo: 'sencilla' }], true).expect(200);
    expect(body.filas[0].errores).toEqual([
      'La habitación 801 tiene una reserva de 3 huéspedes y el tipo Sencilla admite hasta 2',
    ]);
  });

  it('un id de otro hotel dentro del lote responde 404 y no cambia nada', async () => {
    const propia = await crearHabitacion(prisma, { numero: '901' });
    const ajena = await crearHabitacion(prisma, { numero: '901', hotelId: HOTELES_PRUEBA.otro.id });

    await http()
      .post('/habitaciones/lote/estado')
      .send({ ids: [propia.id, ajena.id], estado: 'fuera_servicio' })
      .expect(404);
    await comoOtroHotel
      .post('/habitaciones/lote/tipo')
      .send({ ids: [ajena.id, propia.id], tipoId: ajena.tipoHabitacionId })
      .expect(404);

    const ambas = await prisma.habitacion.findMany({ where: { numero: '901' } });
    expect(ambas.map((h) => h.estado)).toEqual(['libre', 'libre']);
    expect(
      (await prisma.habitacion.findUniqueOrThrow({ where: { id: propia.id } })).tipoHabitacionId,
    ).toBe(tipoId);
  });

  it('la plantilla trae los encabezados y dos filas con los tipos del hotel', async () => {
    const { text, headers } = await http().get('/habitaciones/plantilla').expect(200);
    expect(headers['content-type']).toContain('text/csv');
    expect(text.replace('\uFEFF', '').split('\r\n')).toEqual([
      'numero;tipo;piso;descripcion',
      '101;prueba-80000;1;Vista al jardín',
      '102;prueba-80000;1;',
      '',
    ]);
  });

  it('la migración infiere el piso de las habitaciones existentes', async () => {
    await probarMigracion(
      '20261031000000_piso_y_descripcion',
      // HOTEL_ANTIGUO es anterior a cargo_nino_adicional: aquí van sus columnas de hoy.
      [
        HOTEL_ANTIGUO[0],
        `INSERT INTO tipo_habitacion (id, hotel_id, codigo, nombre, tarifa_base, capacidad_incluida, capacidad_maxima, cargo_persona_adicional, cargo_nino_adicional)
         VALUES ('t1', 'h1', 'doble', 'Doble', 100000, 2, 3, 30000, 15000)`,
        HOTEL_ANTIGUO[2],
        `INSERT INTO habitacion (id, hotel_id, numero, tipo_habitacion_id) VALUES ('c2', 'h1', '1203', 't1')`,
        `INSERT INTO habitacion (id, hotel_id, numero, tipo_habitacion_id) VALUES ('c3', 'h1', 'A-1', 't1')`,
      ],
      async (cliente) => {
        const pisos = await cliente.habitacion.findMany({ orderBy: { id: 'asc' } });
        expect(pisos.map((h) => [h.numero, h.piso])).toEqual([
          ['101', 1],
          ['1203', 12],
          ['A-1', null],
        ]);
      },
    );
  });
});
