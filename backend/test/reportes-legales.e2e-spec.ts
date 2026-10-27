import { INestApplication } from '@nestjs/common';
import type TestAgent from 'supertest/lib/agent';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  HOTEL_PRUEBA_ID,
  RelojFalso,
  crearApp,
  crearHabitacion,
  cuerpoCheckIn,
  cuerpoReserva,
  ocupanteDePrueba,
  reiniciar,
} from './utilidades';

// A-6: reportes de la TRA (todos los huéspedes) y el SIRE (extranjeros, un
// movimiento al entrar y otro al salir), en JSON y en CSV. Solo lectura.
describe('Reportes legales (A-6)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reloj: RelojFalso;
  let http: () => TestAgent;
  let comoRecepcionista: TestAgent;
  let comoPlataforma: TestAgent;

  beforeAll(async () => {
    ({ app, prisma, reloj, http, comoRecepcionista, comoPlataforma } = await crearApp());
  });

  beforeEach(async () => {
    await reiniciar(prisma, reloj); // hoy: 2030-01-01
  });

  afterAll(async () => {
    await app.close();
  });

  const ENERO = { desde: '2030-01-01', hasta: '2030-01-31' };

  // Estadía de hoy al 3 de enero, con check-in de los ocupantes indicados.
  const alojar = async (
    numero: string,
    ocupantes: object[],
    titular: { documento: string; tipoDocumento?: string } = { documento: '123' },
    edadesNinos: number[] = [],
  ) => {
    const habitacion = await crearHabitacion(prisma, { numero });
    const cuerpo = cuerpoReserva(habitacion.id, '2030-01-01', '2030-01-03');
    const { body } = await http()
      .post('/reservas')
      .send({
        ...cuerpo,
        huesped: { ...cuerpo.huesped, ...titular },
        adultos: ocupantes.length - edadesNinos.length,
        edadesNinos,
      })
      .expect(201);
    await http().post(`/reservas/${body.id}/check-in`).send(cuerpoCheckIn(ocupantes)).expect(201);
    return body.id as string;
  };

  const salir = (id: string) => {
    reloj.fijar('2030-01-03T10:00:00-05:00');
    return http().post(`/reservas/${id}/check-out`).send({ medioPago: 'efectivo' }).expect(201);
  };

  const hijo = (documento: string, fechaNacimiento: string) =>
    ocupanteDePrueba({
      titular: false,
      tipoDocumento: 'TI',
      documento,
      primerNombre: 'Hijo',
      fechaNacimiento,
      responsableIndice: 0,
      parentesco: 'padre_madre',
      aceptaPoliticaDatos: false,
    });

  it('una familia de 4 da 4 filas; acompañantes y valor pagado solo en el titular', async () => {
    const id = await alojar(
      '101',
      [
        ocupanteDePrueba({ ciudadResidencia: 'Cali, Valle del Cauca' }),
        ocupanteDePrueba({
          titular: false,
          tipoDocumento: 'CC',
          documento: 'A2',
          primerNombre: 'Otra',
        }),
        hijo('H1', '2021-06-01'),
        hijo('H2', '2020-06-01'),
      ],
      undefined,
      [8, 9],
    );
    const { body: cerrada } = await salir(id);

    const { body } = await http().get('/reportes-legales/tra').query(ENERO).expect(200);

    expect(body).toHaveLength(4);
    expect(body[0]).toMatchObject({
      titular: true,
      documento: '123',
      acompanantes: 3,
      valorPagado: Number(cerrada.total).toFixed(0),
      tipoAlojamiento: 'Hotel',
      // DIVIPOLA de "Cali, Valle del Cauca".
      codigoCiudadResidencia: '76001',
      ciudadProcedencia: 'Bogotá',
      codigoCiudadProcedencia: '11001',
    });
    expect(
      body
        .slice(1)
        .map((f: { acompanantes: unknown; valorPagado: unknown }) => [
          f.acompanantes,
          f.valorPagado,
        ]),
    ).toEqual([
      ['', ''],
      ['', ''],
      ['', ''],
    ]);
  });

  it('una estadía activa aún no tiene valor pagado', async () => {
    await alojar('101', [ocupanteDePrueba()]);
    const { body } = await http().get('/reportes-legales/tra').query(ENERO).expect(200);
    expect(body[0]).toMatchObject({ acompanantes: 0, valorPagado: '' });
  });

  it('el SIRE lleva a los extranjeros con su entrada y su salida; los colombianos no', async () => {
    const extranjero = await alojar('101', [ocupanteDePrueba({ nacionalidad: 'US' })]);
    await alojar('102', [ocupanteDePrueba({ documento: '456' })], { documento: '456' });
    await salir(extranjero);

    const { body } = await http().get('/reportes-legales/sire').query(ENERO).expect(200);

    expect(
      body.map((f: { movimiento: string; fecha: string; documento: string }) => [
        f.movimiento,
        f.fecha,
        f.documento,
      ]),
    ).toEqual([
      ['E', '2030-01-01', '123'],
      ['S', '2030-01-03', '123'],
    ]);
    expect(body[0]).toMatchObject({ nacionalidad: 'US', fechaNacimiento: '1990-05-20' });
  });

  it('el CSV empieza con el BOM, separa con ";" y escapa lo que lo necesita', async () => {
    await alojar('101', [ocupanteDePrueba({ ciudadProcedencia: 'Cali; "sur"' })]);

    const res = await http()
      .get('/reportes-legales/tra')
      .query({ ...ENERO, formato: 'csv' })
      .buffer(true)
      .parse((r, listo) => {
        let texto = '';
        r.setEncoding('utf8');
        r.on('data', (parte: string) => (texto += parte));
        r.on('end', () => listo(null, texto));
      })
      .expect(200);

    expect(res.headers['content-type']).toMatch(/^text\/csv/);
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="tra-2030-01-01-2030-01-31.csv"',
    );
    const csv = res.body as string;
    expect(csv.startsWith('\uFEFFTipo de documento;Número de documento;Nombres;')).toBe(true);
    expect(csv).toContain(';"Cali; ""sur""";');
  });

  it('las estadías con datos incompletos quedan en pendientes', async () => {
    const habitacion = await crearHabitacion(prisma, { numero: '101' });
    const { body } = await http()
      .post('/reservas')
      .send(cuerpoReserva(habitacion.id, '2030-01-01', '2030-01-03'))
      .expect(201);
    // Como una estadía migrada: activa, con su titular provisional y sin fecha de nacimiento.
    await prisma.reserva.update({ where: { id: body.id }, data: { estado: 'activa' } });
    await prisma.ocupante.create({
      data: {
        hotelId: HOTEL_PRUEBA_ID,
        reservaId: body.id,
        huespedId: body.huespedId,
        titular: true,
      },
    });
    await alojar('102', [ocupanteDePrueba({ documento: '456' })], { documento: '456' });

    const pendientes = await http().get('/reportes-legales/pendientes').query(ENERO).expect(200);

    expect(pendientes.body).toHaveLength(1);
    expect(pendientes.body[0]).toMatchObject({ reservaId: body.id, titular: { documento: '123' } });
    expect(pendientes.body[0].personas[0].faltan).toEqual(
      expect.arrayContaining(['primer apellido', 'fecha de nacimiento', 'ciudad de procedencia']),
    );
  });

  it('recepción ve los reportes; el equipo de plataforma no', async () => {
    await comoRecepcionista.get('/reportes-legales/tra').query(ENERO).expect(200);
    await comoPlataforma.get('/reportes-legales/tra').query(ENERO).expect(403);
  });

  it('rechaza un rango invertido o de más de un año', async () => {
    await http()
      .get('/reportes-legales/tra')
      .query({ desde: '2030-02-01', hasta: '2030-01-01' })
      .expect(400);
    await http()
      .get('/reportes-legales/sire')
      .query({ desde: '2030-01-01', hasta: '2031-01-02' })
      .expect(400);
    await http()
      .get('/reportes-legales/tra')
      .query({ desde: '2030-01-01', hasta: '2030-12-31' })
      .expect(200);
    await http()
      .get('/reportes-legales/tra')
      .query({ ...ENERO, formato: 'pdf' })
      .expect(400);
  });
});
