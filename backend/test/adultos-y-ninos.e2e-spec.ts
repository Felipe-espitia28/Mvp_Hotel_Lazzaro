import { INestApplication } from '@nestjs/common';
import type TestAgent from 'supertest/lib/agent';
import { PrismaService } from '../src/prisma/prisma.service';
import { HOTEL_ANTIGUO, probarMigracion } from './migraciones';
import {
  RelojFalso,
  crearApp,
  crearHabitacion,
  cuerpoCheckIn,
  cuerpoReserva,
  ocupanteDePrueba,
  reiniciar,
} from './utilidades';

// A-3: tarifas por rango de edad. Por defecto: 0–4 gratis, 5–11 tarifa de
// niño, 12+ adulto. La habitación de prueba: 2 incluidos, máximo 4, 30.000
// por adulto adicional y 15.000 por niño con cargo (el 1 de enero es
// temporada alta: el alojamiento se toma del desglose). El
// titular viaja con pasaporte (exento de IVA): el total es solo lo cobrado.
describe('Adultos y niños (A-3)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reloj: RelojFalso;
  let http: () => TestAgent;
  let habitacionId: string;

  beforeAll(async () => {
    ({ app, prisma, reloj, http } = await crearApp());
  });

  beforeEach(async () => {
    await reiniciar(prisma, reloj); // hoy: 2030-01-01
    habitacionId = (await crearHabitacion(prisma)).id;
  });

  afterAll(async () => {
    await app.close();
  });

  // Dos noches desde hoy.
  const reservar = (adultos: number, edadesNinos: number[]) =>
    http()
      .post('/reservas')
      .send({ ...cuerpoReserva(habitacionId, '2030-01-01', '2030-01-03'), adultos, edadesNinos });

  const disponibles = (adultos: number, edadesNinos: string) =>
    http()
      .get('/habitaciones/disponibles')
      .query({ desde: '2030-01-01', hasta: '2030-01-03', adultos, edadesNinos })
      .expect(200);

  // Un hijo del titular nacido en esa fecha (menor colombiano: TI desde los 7 años).
  const hijo = (documento: string, fechaNacimiento: string, tipoDocumento = 'TI') =>
    ocupanteDePrueba({
      titular: false,
      documento,
      tipoDocumento,
      primerNombre: 'Hijo',
      fechaNacimiento,
      responsableIndice: 0,
      parentesco: 'padre_madre',
      aceptaPoliticaDatos: false,
    });
  const adulto = (documento: string) =>
    ocupanteDePrueba({ titular: false, tipoDocumento: 'CC', documento, primerNombre: 'Otro' });

  it('cotiza a los niños según su edad y guarda adultos y edades', async () => {
    const res = await reservar(2, [3, 8]).expect(201);

    expect(res.body).toMatchObject({ adultos: 2, edadesNinos: [3, 8], numeroHuespedes: 4 });
    expect(res.body.desglose).toMatchObject({
      ninos: { gratis: 1, conCargo: 1 },
      personasAdicionales: 0,
      ninosAdicionales: 2 * 15000,
    });
    expect(Number(res.body.valorAlojamiento)).toBe(res.body.desglose.alojamiento + 2 * 15000);
  });

  it('la disponibilidad cuenta a todos para la capacidad, también a los niños gratis', async () => {
    expect((await disponibles(2, '1,2,3')).body).toEqual([]);

    const { body } = await disponibles(2, '1,2');
    expect(body).toHaveLength(1);
    expect(body[0].cotizacion.ninos).toEqual({ gratis: 2, conCargo: 0 });
  });

  it('cambiar los rangos del hotel no altera una reserva existente', async () => {
    const { body } = await reservar(2, [8]).expect(201);

    await http()
      .patch('/hotel/politicas')
      .send({ edadMaximaNinoGratis: 10, edadMaximaNino: 13 })
      .expect(200);

    const guardada = await prisma.reserva.findUniqueOrThrow({ where: { id: body.id } });
    expect(Number(guardada.valorAlojamiento)).toBe(body.desglose.alojamiento + 2 * 15000);
    // Una reserva nueva sí usa los rangos nuevos: el niño de 8 ya no paga.
    await http().post(`/reservas/${body.id}/cancelar`).expect(201);
    const nueva = await reservar(2, [8]).expect(201);
    expect(nueva.body.desglose.ninos).toEqual({ gratis: 1, conCargo: 0 });
  });

  it('los rangos de edad no se pueden cruzar', async () => {
    await http()
      .patch('/hotel/politicas')
      .send({ edadMaximaNinoGratis: 8, edadMaximaNino: 5 })
      .expect(400);
  });

  describe('check-in', () => {
    it('rechaza más ocupantes que los declarados', async () => {
      const { body } = await reservar(1, [8]).expect(201);

      await http()
        .post(`/reservas/${body.id}/check-in`)
        .send(
          cuerpoCheckIn([ocupanteDePrueba(), hijo('H1', '2021-06-01'), hijo('H2', '2020-06-01')]),
        )
        .expect(400);
    });

    it('con las edades declaradas, no deja aviso', async () => {
      const { body } = await reservar(1, [8]).expect(201);

      const res = await http()
        .post(`/reservas/${body.id}/check-in`)
        .send(cuerpoCheckIn([ocupanteDePrueba(), hijo('H1', '2021-06-01')]))
        .expect(201);

      expect(res.body.avisos).toEqual([]);
    });

    it('una edad distinta a la declarada deja un aviso y su evento, y conserva el precio', async () => {
      const { body } = await reservar(1, [8]).expect(201);

      // Tiene 9 años, no 8.
      const res = await http()
        .post(`/reservas/${body.id}/check-in`)
        .send(cuerpoCheckIn([ocupanteDePrueba(), hijo('H1', '2020-06-01')]))
        .expect(201);

      expect(res.body.avisos).toEqual([
        'Al reservar se declaró un niño de 8 años; en el check-in se registró un niño de 9 años. Se conserva el precio pactado.',
      ]);
      expect(res.body.valorAlojamiento).toBe(body.valorAlojamiento);
      const eventos = await prisma.eventoReserva.findMany({
        where: { reservaId: body.id, tipo: 'diferencia_edad' },
      });
      expect(eventos).toHaveLength(1);
    });

    it('el niño que ya cumplió 12 se aloja con aviso (el total de ocupantes cuadra)', async () => {
      const { body } = await reservar(1, [11]).expect(201);

      const res = await http()
        .post(`/reservas/${body.id}/check-in`)
        .send(cuerpoCheckIn([ocupanteDePrueba(), hijo('H1', '2017-06-01')]))
        .expect(201);

      expect(res.body.avisos[0]).toMatch(/se registró ningún niño/);
      expect(res.body.valorAlojamiento).toBe(body.valorAlojamiento);
    });

    it('un adulto registrado donde se declaró un niño también deja aviso', async () => {
      const { body } = await reservar(1, [3]).expect(201);

      const res = await http()
        .post(`/reservas/${body.id}/check-in`)
        .send(cuerpoCheckIn([ocupanteDePrueba(), adulto('A1')]))
        .expect(201);

      expect(res.body.avisos).toHaveLength(1);
    });
  });
});

describe('Migración adultos_y_ninos', () => {
  it('las reservas antiguas quedan con sus huéspedes como adultos y el cargo por niño a la mitad', async () => {
    await probarMigracion(
      '20261028000000_adultos_y_ninos',
      [
        ...HOTEL_ANTIGUO,
        `INSERT INTO huesped (id, hotel_id, nombre, primer_nombre, documento) VALUES ('g1', 'h1', 'Ana', 'Ana', '111')`,
        `INSERT INTO reserva (id, hotel_id, habitacion_id, huesped_id, fecha_entrada, fecha_salida, estado, valor_alojamiento, numero_huespedes)
         VALUES ('r1', 'h1', 'c1', 'g1', '2026-01-10', '2026-01-12', 'cerrada', 200000, 3)`,
      ],
      async (cliente) => {
        const [reserva] = await cliente.$queryRawUnsafe<{ adultos: number; ninos: number[] }[]>(
          `SELECT adultos, edades_ninos AS ninos FROM reserva WHERE id = 'r1'`,
        );
        expect(reserva).toEqual({ adultos: 3, ninos: [] });
        const [tipo] = await cliente.$queryRawUnsafe<{ cargo: string }[]>(
          `SELECT cargo_nino_adicional::text AS cargo FROM tipo_habitacion WHERE id = 't1'`,
        );
        // 30.001 / 2 = 15.000,5 → al peso.
        expect(tipo.cargo).toBe('15001.00');
      },
    );
  }, 180000);
});
