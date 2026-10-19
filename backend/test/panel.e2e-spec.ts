import { INestApplication } from '@nestjs/common';
import type TestAgent from 'supertest/lib/agent';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  AHORA_POR_DEFECTO,
  HOTEL_PRUEBA_ID,
  RelojFalso,
  crearApp,
  crearHabitacion,
  cuerpoReserva,
  reiniciar,
} from './utilidades';

// Escenario: "hoy" es el 10 de enero de 2030, 4 habitaciones de $80.000.
//   A 101  10→13 confirmada   llega hoy
//   B 102  07→10 activa       sale hoy
//   C 103  09→12 activa       alojado
//   D 104  09→11 confirmada   llegada atrasada (no-show a las 12:00 de hoy)
//   E 101  02→05 cerrada      liquidada en enero: 3 noches de alta × $104.000
//   F 102  20→22 cancelada    tardía: penalidad $80.000
//   G 103  dic.  cerrada      de otro mes: no cuenta
describe('Panel "Hoy" y calendario', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reloj: RelojFalso;
  let http: () => TestAgent;
  let comoRecepcionista: TestAgent;
  const ids: Record<string, string> = {};

  const reservar = async (clave: string, habitacionId: string, entrada: string, salida: string) => {
    const res = await http()
      .post('/reservas')
      .send(cuerpoReserva(habitacionId, entrada, salida))
      .expect(201);
    ids[clave] = res.body.id;
  };

  const a = (iso: string) => reloj.fijar(`${iso}-05:00`);

  beforeAll(async () => {
    ({ app, prisma, reloj, http, comoRecepcionista } = await crearApp());
  });

  beforeEach(async () => {
    await reiniciar(prisma, reloj);
    const [h101, h102, h103, h104] = await Promise.all(
      ['101', '102', '103', '104'].map(
        async (numero) => (await crearHabitacion(prisma, { numero })).id,
      ),
    );

    await reservar('E', h101, '2030-01-02', '2030-01-05');
    await reservar('A', h101, '2030-01-10', '2030-01-13');
    await reservar('B', h102, '2030-01-07', '2030-01-10');
    await reservar('F', h102, '2030-01-20', '2030-01-22');
    await reservar('C', h103, '2030-01-09', '2030-01-12');
    await reservar('D', h104, '2030-01-09', '2030-01-11');

    a('2030-01-02T15:00:00');
    await http()
      .post(`/reservas/${ids.E}/check-in`)
      .send({ nacionalidad: 'CO', procedencia: 'Bogotá', motivoViaje: 'turismo' })
      .expect(201);
    a('2030-01-05T11:00:00'); // E sale el día pactado
    await http().post(`/reservas/${ids.E}/check-out`).send({ medioPago: 'efectivo' }).expect(201);
    a('2030-01-07T15:00:00');
    await http()
      .post(`/reservas/${ids.B}/check-in`)
      .send({ nacionalidad: 'CO', procedencia: 'Bogotá', motivoViaje: 'turismo' })
      .expect(201);
    a('2030-01-09T15:00:00');
    await http()
      .post(`/reservas/${ids.C}/check-in`)
      .send({ nacionalidad: 'CO', procedencia: 'Bogotá', motivoViaje: 'turismo' })
      .expect(201);
    a('2030-01-19T09:00:00'); // menos de 48 h antes del 20: con penalidad
    await http().post(`/reservas/${ids.F}/cancelar`).expect(201);

    // Una estadía cerrada de diciembre (creada directo: ya es pasado).
    const huesped = await prisma.huesped.create({
      data: { hotelId: HOTEL_PRUEBA_ID, nombre: 'Viejo', documento: 'G' },
    });
    await prisma.reserva.create({
      data: {
        hotelId: HOTEL_PRUEBA_ID,
        habitacionId: h103,
        huespedId: huesped.id,
        fechaEntrada: new Date('2029-12-20'),
        fechaSalida: new Date('2029-12-22'),
        estado: 'cerrada',
        valorAlojamiento: 999,
        total: 999,
      },
    });

    a('2030-01-10T11:00:00');
  });

  afterAll(async () => {
    reloj.fijar(AHORA_POR_DEFECTO);
    await app.close();
  });

  const panel = async () => (await http().get('/panel/hoy').expect(200)).body;
  const huespedes = (reservas: { id: string; atrasada: boolean }[]) =>
    reservas.map((r) => [Object.keys(ids).find((k) => ids[k] === r.id), r.atrasada]);

  describe('GET /panel/hoy', () => {
    it('calcula la ocupación de esta noche', async () => {
      // A, C y D ocupan la noche del 10; B sale hoy y E/F no aplican.
      expect((await panel()).ocupacion).toEqual({
        habitacionesOcupadas: 3,
        totalHabitaciones: 4,
        porcentaje: 75,
      });
    });

    it('lista las llegadas pendientes, marcando las atrasadas', async () => {
      const { llegadas } = await panel();
      expect(huespedes(llegadas)).toEqual([
        ['D', true],
        ['A', false],
      ]);
      expect(llegadas[1].huesped.nombre).toBeDefined();
      expect(llegadas[1].habitacion.numero).toBe('101');
    });

    it('una llegada atrasada desaparece al vencer (no-show)', async () => {
      a('2030-01-10T12:00:00');
      expect(huespedes((await panel()).llegadas)).toEqual([['A', false]]);
    });

    it('lista las salidas pendientes y los huéspedes alojados', async () => {
      const datos = await panel();
      expect(huespedes(datos.salidas)).toEqual([['B', false]]);
      expect(datos.huespedesAlojados).toBe(2);
    });

    it('marca como atrasada una salida que ya debió ocurrir', async () => {
      a('2030-01-12T13:00:00');
      expect(huespedes((await panel()).salidas)).toEqual([
        ['B', true],
        ['C', false],
      ]);
    });

    it('suma los ingresos del mes: estadías liquidadas y penalidades', async () => {
      const { ingresosDelMes } = await panel();
      // E: 3 noches en temporada alta (1-15 ene, ×1,30). F: penalidad de una noche baja.
      expect(Number(ingresosDelMes.alojamiento)).toBe(3 * 104000);
      expect(Number(ingresosDelMes.penalidades)).toBe(80000);
      expect(Number(ingresosDelMes.total)).toBe(3 * 104000 + 80000);
    });

    it('recepción puede verlo', async () => {
      await comoRecepcionista.get('/panel/hoy').expect(200);
    });
  });

  describe('GET /panel/calendario', () => {
    it('devuelve habitaciones y las reservas que ocupan noches del rango', async () => {
      const res = await http()
        .get('/panel/calendario')
        .query({ desde: '2030-01-08', dias: 7 })
        .expect(200);

      expect(res.body.dias).toBe(7);
      expect(res.body.habitaciones.map((h: { numero: string }) => h.numero)).toEqual([
        '101',
        '102',
        '103',
        '104',
      ]);
      const claves = res.body.reservas.map((r: { id: string }) =>
        Object.keys(ids).find((k) => ids[k] === r.id),
      );
      // E (02→05) queda fuera del rango y F está cancelada.
      expect(claves.sort()).toEqual(['A', 'B', 'C', 'D']);
      expect(res.body.reservas[0].huesped.nombre).toBeDefined();
    });

    it('por defecto empieza hoy y muestra 14 días', async () => {
      const res = await http().get('/panel/calendario').expect(200);
      expect(res.body.desde).toBe('2030-01-10T00:00:00.000Z');
      expect(res.body.hoy).toBe('2030-01-10T00:00:00.000Z');
      expect(res.body.dias).toBe(14);
    });

    it('incluye estadías cerradas del pasado (historial visual)', async () => {
      const res = await http()
        .get('/panel/calendario')
        .query({ desde: '2030-01-01', dias: 7 })
        .expect(200);
      expect(res.body.reservas.map((r: { estado: string }) => r.estado)).toContain('cerrada');
    });

    it('rechaza con 400 más de 31 días o fechas inválidas', async () => {
      await http().get('/panel/calendario').query({ dias: 32 }).expect(400);
      await http().get('/panel/calendario').query({ desde: 'mañana' }).expect(400);
    });
  });
});
