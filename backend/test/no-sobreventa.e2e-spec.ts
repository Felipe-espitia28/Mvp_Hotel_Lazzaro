import { INestApplication } from '@nestjs/common';
import type TestAgent from 'supertest/lib/agent';
import { PrismaService } from '../src/prisma/prisma.service';
import { esViolacionDeNoSobreventa } from '../src/reservas/reservas.service';
import { crearApp, crearHabitacion, cuerpoReserva, limpiarBD } from './utilidades';

// Invariante 1 (la más importante): una habitación no puede tener dos reservas
// confirmadas/activas que se solapen en fechas.
describe('No-sobreventa', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: () => TestAgent;
  let habitacionId: string;

  beforeAll(async () => {
    ({ app, prisma, http } = await crearApp());
  });

  beforeEach(async () => {
    await limpiarBD(prisma);
    habitacionId = (await crearHabitacion(prisma)).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const reservar = (entrada: string, salida: string, id = habitacionId) =>
    http()
      .post('/reservas')
      .send(cuerpoReserva(id, entrada, salida));

  it('crea una reserva válida con 201 y estado confirmada', async () => {
    const res = await reservar('2030-03-10', '2030-03-15').expect(201);

    expect(res.body.estado).toBe('confirmada');
    expect(res.body.habitacionId).toBe(habitacionId);
    expect(res.body.huesped.nombre).toBe('Huésped de prueba');
    expect(res.body.total).toBeNull();
  });

  it.each([
    ['se solapa al final', '2030-03-12', '2030-03-18'],
    ['se solapa al inicio', '2030-03-08', '2030-03-11'],
    ['queda contenida', '2030-03-11', '2030-03-13'],
    ['la contiene', '2030-03-01', '2030-03-30'],
    ['tiene las mismas fechas', '2030-03-10', '2030-03-15'],
  ])('rechaza con 409 una reserva que %s', async (_caso, entrada, salida) => {
    await reservar('2030-03-10', '2030-03-15').expect(201);

    const res = await reservar(entrada, salida).expect(409);
    expect(res.body.message).toMatch(/solapa/);
    expect(await prisma.reserva.count()).toBe(1);
  });

  it('permite reservas contiguas: la salida de una es la entrada de otra', async () => {
    // El rango es [entrada, salida): el día de salida queda libre.
    await reservar('2030-03-10', '2030-03-15').expect(201);
    await reservar('2030-03-15', '2030-03-20').expect(201);
    await reservar('2030-03-05', '2030-03-10').expect(201);
  });

  it('permite las mismas fechas en otra habitación', async () => {
    const otra = await crearHabitacion(prisma, { numero: '102' });

    await reservar('2030-03-10', '2030-03-15').expect(201);
    await reservar('2030-03-10', '2030-03-15', otra.id).expect(201);
  });

  it('una reserva cancelada o cerrada no bloquea las fechas', async () => {
    const res = await reservar('2030-03-10', '2030-03-15').expect(201);

    await prisma.reserva.update({
      where: { id: res.body.id },
      data: { estado: 'cancelada' },
    });
    const segunda = await reservar('2030-03-10', '2030-03-15').expect(201);

    await prisma.reserva.update({
      where: { id: segunda.body.id },
      data: { estado: 'cerrada' },
    });
    await reservar('2030-03-12', '2030-03-14').expect(201);
  });

  it('rechaza con 400 si la salida no es posterior a la entrada', async () => {
    await reservar('2030-03-15', '2030-03-15').expect(400);
    await reservar('2030-03-15', '2030-03-10').expect(400);
  });

  it('responde 404 si la habitación no existe', async () => {
    const res = await reservar(
      '2030-03-10',
      '2030-03-15',
      '00000000-0000-0000-0000-000000000000',
    ).expect(404);

    expect(res.body.message).toMatch(/[Hh]abitación/);
    expect(await prisma.huesped.count()).toBe(0);
  });

  it('rechaza con 400 una reserva sin datos del huésped', async () => {
    await http()
      .post('/reservas')
      .send({ habitacionId, fechaEntrada: '2030-03-10', fechaSalida: '2030-03-15' })
      .expect(400);
  });

  it('bajo concurrencia, de N peticiones solapadas solo una gana', async () => {
    // Todas salen a la vez: la validación previa del servicio no basta porque
    // varias pasan el findFirst antes de que alguna inserte. Lo que garantiza
    // el resultado es la restricción EXCLUDE de PostgreSQL.
    const N = 10;
    const respuestas = await Promise.all(
      Array.from({ length: N }, (_, i) => reservar(`2030-03-${10 + (i % 3)}`, '2030-03-15')),
    );
    const estados = respuestas.map((r) => r.status);

    expect(estados.filter((s) => s === 201)).toHaveLength(1);
    expect(estados.filter((s) => s === 409)).toHaveLength(N - 1);
    expect(await prisma.reserva.count()).toBe(1);
  });

  it('la base de datos rechaza el solapamiento aunque se salte el servicio', async () => {
    // Prueba la garantía real: insertar directo con Prisma, sin validación previa.
    const huesped = await prisma.huesped.create({
      data: { nombre: 'Directo', documento: '999' },
    });
    const datos = {
      habitacionId,
      huespedId: huesped.id,
      fechaSalida: new Date('2030-03-15'),
      valorAlojamiento: 400000,
    };

    await prisma.reserva.create({
      data: { ...datos, fechaEntrada: new Date('2030-03-10') },
    });
    await expect(
      prisma.reserva.create({
        data: { ...datos, fechaEntrada: new Date('2030-03-12') },
      }),
    ).rejects.toThrow(/code: "23P01"/);
  });

  describe('detección del error de solapamiento', () => {
    // Regresión: Prisma incluye en el mensaje de error las líneas de código
    // alrededor de la llamada; un comentario que mencionara "23P01" hacía que
    // cualquier error (p. ej. habitación inexistente) se reportara como 409.
    const capturar = (promesa: Promise<unknown>) =>
      promesa.then(
        () => {
          throw new Error('se esperaba un error');
        },
        (error: unknown) => error,
      );

    // Prisma muestra las líneas previas a la llamada, como esta: 23P01.
    const crearReservaDirecta = (habitacion: string, entrada: string) =>
      prisma.reserva.create({
        data: {
          habitacion: { connect: { id: habitacion } },
          // Un huésped distinto por inserción: el documento es único.
          huesped: { create: { nombre: 'Directo', documento: `doc-${entrada}` } },
          fechaEntrada: new Date(entrada),
          fechaSalida: new Date('2030-03-15'),
          valorAlojamiento: 400000,
        },
      });

    it('reconoce la violación real de la restricción', async () => {
      await crearReservaDirecta(habitacionId, '2030-03-10');
      const error = await capturar(crearReservaDirecta(habitacionId, '2030-03-12'));

      expect(esViolacionDeNoSobreventa(error)).toBe(true);
    });

    it('no confunde otros errores de Prisma con un solapamiento', async () => {
      const error = await capturar(
        crearReservaDirecta('00000000-0000-0000-0000-000000000000', '2030-03-10'),
      );

      expect((error as Error).message).toContain('23P01'); // el comentario de arriba
      expect(esViolacionDeNoSobreventa(error)).toBe(false);
    });
  });
});
