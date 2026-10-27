import { INestApplication } from '@nestjs/common';
import type TestAgent from 'supertest/lib/agent';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  HOTEL_PRUEBA_ID,
  RelojFalso,
  USUARIOS_PRUEBA,
  crearApp,
  crearHabitacion,
  cuerpoCheckIn,
  ocupanteDePrueba,
  reiniciar,
} from './utilidades';
import { HOTEL_ANTIGUO, probarMigracion } from './migraciones';

// R43–R46: cada reserva registra a todos sus ocupantes con sus datos legales
// (TRA, SIRE, menores y autorización de datos).
describe('Ocupantes y datos legales (R43–R46)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reloj: RelojFalso;
  let http: () => TestAgent;
  let comoRecepcionista: TestAgent;

  beforeAll(async () => {
    ({ app, prisma, reloj, http, comoRecepcionista } = await crearApp());
  });

  beforeEach(async () => {
    await reiniciar(prisma, reloj); // hoy: 2030-01-01
  });

  afterAll(async () => {
    await app.close();
  });

  // Reserva para hoy cuyo titular es el de ocupanteDePrueba (PASAPORTE 123).
  const reservar = async (numero: string, adultos = 1, huesped: object = {}) => {
    const habitacion = await crearHabitacion(prisma, { numero });
    const res = await http()
      .post('/reservas')
      .send({
        habitacionId: habitacion.id,
        huesped: {
          nombre: 'Huésped de prueba',
          tipoDocumento: 'PASAPORTE',
          documento: '123',
          ...huesped,
        },
        adultos,
        fechaEntrada: '2030-01-01',
        fechaSalida: '2030-01-03',
      })
      .expect(201);
    return res.body.id as string;
  };

  const checkIn = (id: string, ocupantes: object[]) =>
    http().post(`/reservas/${id}/check-in`).send(cuerpoCheckIn(ocupantes));

  const acompanante = (documento: string, cambios: object = {}) =>
    ocupanteDePrueba({
      titular: false,
      tipoDocumento: 'CC',
      documento,
      primerNombre: 'Ana',
      primerApellido: 'Pérez',
      ...cambios,
    });

  // 11 años el día de la entrada: tarjeta de identidad.
  const menor = (cambios: object = {}) =>
    acompanante('M1', {
      tipoDocumento: 'TI',
      primerNombre: 'Leo',
      fechaNacimiento: '2018-03-01',
      responsableIndice: 0,
      parentesco: 'padre_madre',
      aceptaPoliticaDatos: false, // la da su responsable
      ...cambios,
    });

  const estado = async (id: string) =>
    (await prisma.reserva.findUniqueOrThrow({ where: { id } })).estado;

  it('registra al titular y a sus acompañantes', async () => {
    const id = await reservar('101', 3);

    await checkIn(id, [
      ocupanteDePrueba(),
      acompanante('A1'),
      acompanante('A2', { primerNombre: 'Luis' }),
    ]).expect(201);

    const ocupantes = await http().get(`/reservas/${id}/ocupantes`).expect(200);
    expect(ocupantes.body).toHaveLength(3);
    expect(ocupantes.body[0]).toMatchObject({ titular: true, huesped: { documento: '123' } });

    const registro = await http().get('/reservas/registro-hotelero').expect(200);
    expect(registro.body.registros[0].ocupantes.map((o: { nombre: string }) => o.nombre)).toEqual([
      'Huésped de prueba',
      'Ana Pérez',
      'Luis Pérez',
    ]);
  });

  it('dice qué le falta a cada ocupante y no hace el check-in', async () => {
    const id = await reservar('101', 2);

    const res = await checkIn(id, [
      ocupanteDePrueba(),
      acompanante('A1', { fechaNacimiento: undefined }),
    ]).expect(400);

    expect(res.body.message).toEqual(['Ocupante 2 (Ana Pérez): falta fecha de nacimiento']);
    // Para que la pantalla marque el campo en la tarjeta de ese ocupante.
    expect(res.body.problemas).toEqual([
      { ocupante: 1, campo: 'fechaNacimiento', mensaje: 'Falta fecha de nacimiento' },
    ]);
    expect(await estado(id)).toBe('confirmada');
    expect(await prisma.ocupante.count({ where: { reservaId: id } })).toBe(0);
  });

  it('exige un titular, que sea el de la reserva, y tantos ocupantes como huéspedes', async () => {
    const id = await reservar('101', 2);

    await checkIn(id, [acompanante('A1'), acompanante('A2')]).expect(400);
    await checkIn(id, [ocupanteDePrueba({ documento: '999' }), acompanante('A1')]).expect(400);
    await checkIn(id, [ocupanteDePrueba()]).expect(400);
    await checkIn(id, [
      ocupanteDePrueba(),
      acompanante('123', { tipoDocumento: 'PASAPORTE' }),
    ]).expect(400);
    expect(await estado(id)).toBe('confirmada');
  });

  describe('menores de edad (R44)', () => {
    it('necesitan un adulto responsable en la reserva', async () => {
      const id = await reservar('101', 2);
      const res = await checkIn(id, [
        ocupanteDePrueba(),
        menor({ responsableIndice: undefined }),
      ]).expect(400);
      expect(res.body.message).toEqual([
        'Ocupante 2 (Leo Pérez): es menor de edad y necesita un adulto responsable en la reserva',
      ]);
    });

    it('con un tercero autorizado, exigen el permiso verificado y queda quién lo verificó', async () => {
      const id = await reservar('101', 2);
      await checkIn(id, [ocupanteDePrueba(), menor({ parentesco: 'tercero_autorizado' })]).expect(
        400,
      );

      await checkIn(id, [
        ocupanteDePrueba(),
        menor({ parentesco: 'tercero_autorizado', autorizacionVerificada: true }),
      ]).expect(201);

      const admin = await prisma.usuario.findUniqueOrThrow({
        where: { email: USUARIOS_PRUEBA.admin.email },
      });
      const ocupante = await prisma.ocupante.findFirstOrThrow({
        where: { reservaId: id, titular: false },
        include: { responsable: true },
      });
      expect(ocupante).toMatchObject({
        parentesco: 'tercero_autorizado',
        autorizacionVerificadaPorId: admin.id,
        responsable: { titular: true },
      });
      const registro = await http().get('/reservas/registro-hotelero').expect(200);
      expect(registro.body.registros[0].ocupantes[1]).toMatchObject({ menor: true, edad: 11 });
    });

    it('un menor colombiano de menos de 7 años se registra con registro civil', async () => {
      const id = await reservar('101', 2);
      const bebe = { documento: 'B1', primerNombre: 'Sofi', fechaNacimiento: '2026-06-01' };
      await checkIn(id, [ocupanteDePrueba(), menor(bebe)]).expect(400);
      await checkIn(id, [ocupanteDePrueba(), menor({ ...bebe, tipoDocumento: 'RC' })]).expect(201);
    });

    it('una reserva no puede tener solo menores', async () => {
      const id = await reservar('101');
      const res = await checkIn(id, [
        ocupanteDePrueba({ fechaNacimiento: '2015-01-01', parentesco: 'padre_madre' }),
      ]).expect(400);
      expect(res.body.message[0]).toBe('Una reserva no puede tener solo menores de edad');
    });
  });

  describe('autorización de datos (R45)', () => {
    it('cada adulto acepta la versión vigente de la política del hotel', async () => {
      const id = await reservar('101');
      await checkIn(id, [ocupanteDePrueba({ aceptaPoliticaDatos: false })]).expect(400);

      await checkIn(id, [ocupanteDePrueba()]).expect(201);

      const vigente = await http().get('/hotel/politica-datos').expect(200);
      expect(vigente.body.version).toBe(1);
      const aceptaciones = await prisma.aceptacionDatos.findMany({ include: { politica: true } });
      expect(aceptaciones.map((a) => a.politica.version)).toEqual([1]);
    });

    it('quien ya la aceptó no la repite; una versión nueva se acepta de nuevo', async () => {
      await checkIn(await reservar('101'), [ocupanteDePrueba()]).expect(201);
      await checkIn(await reservar('102'), [
        ocupanteDePrueba({ aceptaPoliticaDatos: false }),
      ]).expect(201);

      const nueva = await http()
        .post('/hotel/politica-datos')
        .send({ texto: 'Nueva política de datos' })
        .expect(201);
      expect(nueva.body.version).toBe(2);

      const tercera = await reservar('103');
      await checkIn(tercera, [ocupanteDePrueba({ aceptaPoliticaDatos: false })]).expect(400);
      await checkIn(tercera, [ocupanteDePrueba()]).expect(201);
    });

    it('la política del hotel la cambia solo quien configura el hotel', async () => {
      await comoRecepcionista.post('/hotel/politica-datos').send({ texto: 'Otra' }).expect(403);
      await http().post('/hotel/politica-datos').send({ texto: '' }).expect(400);
    });
  });

  describe('huésped que vuelve (R36, R46)', () => {
    it('conserva su nombre registrado, pero se le completan los datos que faltaban', async () => {
      const id = await reservar('101', 1, {
        nombre: undefined,
        primerNombre: 'Carla',
        primerApellido: 'Gómez',
      });

      await checkIn(id, [
        ocupanteDePrueba({
          primerNombre: 'Otro',
          primerApellido: 'Nombre',
          fechaNacimiento: '1985-07-07',
        }),
      ]).expect(201);

      const huesped = await prisma.huesped.findFirstOrThrow({ where: { documento: '123' } });
      expect([huesped.nombre, huesped.fechaNacimiento, huesped.datosCompletos]).toEqual([
        'Carla Gómez',
        new Date('1985-07-07'),
        true,
      ]);
    });

    it('un nombre "por completar" se separa en el check-in', async () => {
      const id = await reservar('101', 1, { nombre: 'Ana María Ruiz' });
      const antes = await prisma.huesped.findFirstOrThrow({ where: { documento: '123' } });
      expect([antes.primerNombre, antes.primerApellido]).toEqual(['Ana María Ruiz', '']);

      await checkIn(id, [
        ocupanteDePrueba({ primerNombre: 'Ana', segundoNombre: 'María', primerApellido: 'Ruiz' }),
      ]).expect(201);

      const despues = await prisma.huesped.findFirstOrThrow({ where: { documento: '123' } });
      expect([
        despues.primerNombre,
        despues.segundoNombre,
        despues.primerApellido,
        despues.nombre,
      ]).toEqual(['Ana', 'María', 'Ruiz', 'Ana María Ruiz']);
    });
  });

  it('una reserva migrada con titular provisional queda con los ocupantes del check-in', async () => {
    const id = await reservar('101', 2);
    const reserva = await prisma.reserva.findUniqueOrThrow({ where: { id } });
    // Lo que deja la migración en una reserva confirmada sin check-in.
    await prisma.ocupante.create({
      data: {
        hotelId: HOTEL_PRUEBA_ID,
        reservaId: id,
        huespedId: reserva.huespedId,
        titular: true,
      },
    });

    await checkIn(id, [ocupanteDePrueba(), acompanante('A1')]).expect(201);

    const ocupantes = await prisma.ocupante.findMany({ where: { reservaId: id } });
    expect(ocupantes).toHaveLength(2);
    expect(ocupantes.filter((o) => o.titular)).toHaveLength(1);
  });

  it('dos check-in simultáneos con el mismo acompañante nuevo crean un solo huésped', async () => {
    const primera = await reservar('101', 2);
    const segunda = await reservar('102', 2, { documento: '456' });

    const respuestas = await Promise.all([
      checkIn(primera, [ocupanteDePrueba(), acompanante('NUEVO')]),
      checkIn(segunda, [ocupanteDePrueba({ documento: '456' }), acompanante('NUEVO')]),
    ]);

    expect(respuestas.map((r) => r.status)).toEqual([201, 201]);
    expect(
      await prisma.huesped.count({ where: { hotelId: HOTEL_PRUEBA_ID, documento: 'NUEVO' } }),
    ).toBe(1);
    expect(await prisma.ocupante.count({ where: { huesped: { documento: 'NUEVO' } } })).toBe(2);
  });
});

// La migración ocupantes_y_datos_legales convierte los datos existentes (no
// los borra): ver probarMigracion.
describe('Migración ocupantes_y_datos_legales', () => {
  it('cada reserva antigua queda con su ocupante titular y su procedencia', async () => {
    await probarMigracion(
      '20261027000000_ocupantes_y_datos_legales',
      [
        ...HOTEL_ANTIGUO,
        `INSERT INTO huesped (id, hotel_id, nombre, documento) VALUES ('g1', 'h1', 'Ana María Ruiz', '111')`,
        `INSERT INTO reserva (id, hotel_id, habitacion_id, huesped_id, fecha_entrada, fecha_salida, estado, valor_alojamiento, procedencia)
         VALUES ('r1', 'h1', 'c1', 'g1', '2026-01-10', '2026-01-12', 'cerrada', 200000, 'Cali')`,
      ],
      async (cliente) => {
        const ocupantes = await cliente.$queryRawUnsafe<
          { titular: boolean; ciudad: string; huesped: string }[]
        >(
          `SELECT titular, ciudad_procedencia AS ciudad, huesped_id AS huesped FROM ocupante WHERE reserva_id = 'r1'`,
        );
        expect(ocupantes).toEqual([{ titular: true, ciudad: 'Cali', huesped: 'g1' }]);
        const [huesped] = await cliente.$queryRawUnsafe<
          { primer: string; apellido: string; completos: boolean }[]
        >(
          `SELECT primer_nombre AS primer, primer_apellido AS apellido, datos_completos AS completos FROM huesped WHERE id = 'g1'`,
        );
        expect(huesped).toEqual({ primer: 'Ana María Ruiz', apellido: '', completos: false });
      },
    );
  }, 180000);
});
