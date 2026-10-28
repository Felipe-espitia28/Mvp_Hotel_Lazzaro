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
  cuerpoCheckIn,
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
    await http().post(`/reservas/${ids.E}/check-in`).send(cuerpoCheckIn()).expect(201);
    a('2030-01-05T11:00:00'); // E sale el día pactado
    await http().post(`/reservas/${ids.E}/check-out`).send({ medioPago: 'efectivo' }).expect(201);
    a('2030-01-07T15:00:00');
    await http().post(`/reservas/${ids.B}/check-in`).send(cuerpoCheckIn()).expect(201);
    a('2030-01-09T15:00:00');
    await http().post(`/reservas/${ids.C}/check-in`).send(cuerpoCheckIn()).expect(201);
    a('2030-01-19T09:00:00'); // menos de 48 h antes del 20: con penalidad
    await http().post(`/reservas/${ids.F}/cancelar`).expect(201);

    // Una estadía cerrada de diciembre (creada directo: ya es pasado).
    const huesped = await prisma.huesped.create({
      data: { hotelId: HOTEL_PRUEBA_ID, nombre: 'Viejo', primerNombre: 'Viejo', documento: 'G' },
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

    it('suma los ingresos del mes por noche: alojamiento vendido y penalidades', async () => {
      const { ingresosDelMes, calculadoEn } = await panel();
      // B-1: se atribuyen por noche (no por la fecha de salida), así que cuentan
      // todas las noches de enero vendidas: E 3 + A 3 + B 3 + C 3 + D 2 = 14,
      // todas de temporada alta (1-15 ene, ×1,30 = $104.000). F: penalidad de
      // una noche baja ($80.000).
      expect(ingresosDelMes.alojamiento).toBe(14 * 104000);
      expect(ingresosDelMes.penalidades).toBe(80000);
      expect(ingresosDelMes.total).toBe(14 * 104000 + 80000);
      expect(calculadoEn).toBe('2030-01-10T16:00:00.000Z');
    });

    it('trae el saldo de los que salen hoy y las habitaciones por limpiar', async () => {
      await http()
        .post(`/reservas/${ids.B}/cargos`)
        .send({ categoria: 'minibar', concepto: 'Agua', cantidad: 2, valorUnitario: 5000 })
        .expect(201);
      const { salidas, habitaciones } = await panel();
      const b = await prisma.reserva.findUniqueOrThrow({ where: { id: ids.B } });
      expect(salidas[0].saldo).toBe(Number(b.valorAlojamiento) + 10000);
      // E salió el 5 y la 101 quedó en limpieza.
      expect(habitaciones.porLimpiarLista.map((h: { numero: string }) => h.numero)).toEqual([
        '101',
      ]);
    });

    it('lista los anticipos pendientes de los próximos 7 días si el hotel los exige', async () => {
      const h102 = (await prisma.habitacion.findFirstOrThrow({ where: { numero: '102' } })).id;
      await reservar('H', h102, '2030-01-15', '2030-01-16');
      await reservar('I', h102, '2030-01-25', '2030-01-26'); // a más de 7 días
      expect((await panel()).anticiposPendientes).toEqual([]);

      await http().patch('/hotel/politicas').send({ anticipoObligatorio: true }).expect(200);
      expect(huespedes((await panel()).anticiposPendientes)).toEqual([
        ['D', true],
        ['A', false],
        ['H', false],
      ]);
    });

    it('recepción puede verlo', async () => {
      await comoRecepcionista.get('/panel/hoy').expect(200);
    });
  });

  describe('GET /panel/gerencia', () => {
    const gerencia = async (query: Record<string, string> = {}) =>
      (await http().get('/panel/gerencia').query(query).expect(200)).body;

    it('por defecto calcula este mes: ocupación, ADR, RevPAR e ingresos', async () => {
      await http()
        .post(`/reservas/${ids.C}/cargos`)
        .send({ categoria: 'minibar', concepto: 'Agua', cantidad: 1, valorUnitario: 5000 })
        .expect(201);
      const datos = await gerencia();
      expect(datos.periodo).toEqual({
        desde: '2030-01-01T00:00:00.000Z',
        hasta: '2030-01-31T00:00:00.000Z',
        dias: 31,
      });
      // 4 habitaciones × 31 noches = 124 disponibles; 14 vendidas de $104.000.
      expect(datos.actual).toMatchObject({
        nochesDisponibles: 124,
        nochesVendidas: 14,
        ingresoAlojamiento: 14 * 104000,
        ocupacion: 11.3, // 14 ÷ 124
        adr: 104000,
        revpar: 11742, // 1.456.000 ÷ 124
        ingresoConsumos: 5000,
        consumosPorClasificacion: [{ clasificacion: 'minibar', total: 5000 }],
        cancelaciones: { cuantas: 1, penalidad: 80000 },
        noShows: { cuantas: 0, penalidad: 0 },
      });
      expect(datos.serie).toHaveLength(31);
      expect(datos.serie[9]).toMatchObject({ fecha: '2030-01-10', ocupadas: 3, total: 4 });
      expect(datos.calculadoEn).toBe('2030-01-10T16:00:00.000Z');
    });

    it('compara con el período anterior de la misma duración', async () => {
      const datos = await gerencia();
      // Diciembre: solo G, 2 noches sin desglose por $999.
      expect(datos.periodoAnterior).toEqual({
        desde: '2029-12-01T00:00:00.000Z',
        hasta: '2029-12-31T00:00:00.000Z',
      });
      expect(datos.anterior).toMatchObject({ nochesVendidas: 2, ingresoAlojamiento: 999 });
      expect(datos.variacion.adr).toBe(Math.round(((104000 - 500) / 500) * 1000) / 10);
    });

    it('trae las cuentas por cobrar y los saldos a favor', async () => {
      // F se canceló con penalidad y sin anticipo, y G se creó cerrada sin pagos ($999).
      const { cuentasPorCobrar, saldosAFavor } = await gerencia();
      expect(cuentasPorCobrar.total).toBe(80999);
      expect(cuentasPorCobrar.cuentas.map((c: { reservaId: string }) => c.reservaId)).toContain(
        ids.F,
      );
      expect(saldosAFavor).toEqual({ total: 0, cuentas: [] });
    });

    it('rechaza un período al revés o de más de 366 días', async () => {
      await http()
        .get('/panel/gerencia')
        .query({ desde: '2030-01-10', hasta: '2030-01-01' })
        .expect(400);
      await http()
        .get('/panel/gerencia')
        .query({ desde: '2030-01-01', hasta: '2031-01-02' })
        .expect(400);
    });

    it('recepción no ve los indicadores del negocio (403)', async () => {
      await comoRecepcionista.get('/panel/gerencia').expect(403);
      await comoRecepcionista.get('/panel/pronostico').expect(403);
      await comoRecepcionista.get('/panel/pickup').expect(403);
    });
  });

  describe('GET /panel/pronostico y /panel/pickup', () => {
    it('el pronóstico cuenta las confirmadas y activas, no las canceladas', async () => {
      const { body } = await http().get('/panel/pronostico').query({ dias: 30 }).expect(200);
      expect(body.serie).toHaveLength(30);
      const noche = (fecha: string) =>
        body.serie.find((n: { fecha: string }) => n.fecha === fecha).ocupadas;
      expect(noche('2030-01-10')).toBe(3); // A, C y D
      expect(noche('2030-01-12')).toBe(1); // A
      expect(noche('2030-01-20')).toBe(0); // F está cancelada
      await http().get('/panel/pronostico').query({ dias: 10 }).expect(400);
    });

    it('el pickup cuenta las reservas creadas en los últimos días', async () => {
      const h104 = (await prisma.habitacion.findFirstOrThrow({ where: { numero: '104' } })).id;
      await reservar('J', h104, '2030-03-01', '2030-03-03');
      const { body } = await http().get('/panel/pickup').expect(200);
      // Hoy es el 10: solo J se creó en los últimos 7 días (las demás, el 1).
      expect(body).toMatchObject({ dias: 7, reservas: 1, canceladas: 0, noches: 2 });
      expect(body.ingreso).toBeGreaterThan(0);
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
