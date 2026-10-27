import { INestApplication } from '@nestjs/common';
import type TestAgent from 'supertest/lib/agent';
import { PrismaService } from '../src/prisma/prisma.service';
import { HOTEL_PRUEBA_ID, RelojFalso, crearApp, cuerpoReserva, reiniciar } from './utilidades';

// Tarifas reales de punta a punta (R6, R12–R17): temporadas, personas
// adicionales, IVA y desglose congelado en la reserva.
// "Hoy" en estas pruebas: 2030-01-01. Temporadas 2030 usadas:
//   10-15 mar  baja · 14-20 abr Semana Santa (Pascua 21 abr) · 1-15 ene alta.
describe('Tarifas en la reserva', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reloj: RelojFalso;
  let http: () => TestAgent;
  let dobleId: string; // habitación doble: $100.000, 2 incluidos, máx. 3, adicional $40.000

  beforeAll(async () => {
    ({ app, prisma, reloj, http } = await crearApp());
  });

  beforeEach(async () => {
    await reiniciar(prisma, reloj);
    const tipo = await prisma.tipoHabitacion.create({
      data: {
        hotelId: HOTEL_PRUEBA_ID,
        codigo: 'doble',
        nombre: 'Doble',
        tarifaBase: 100000,
        capacidadIncluida: 2,
        capacidadMaxima: 3,
        cargoPersonaAdicional: 40000,
        cargoNinoAdicional: 20000,
      },
    });
    dobleId = (
      await prisma.habitacion.create({
        data: { hotelId: HOTEL_PRUEBA_ID, numero: '201', tipoHabitacionId: tipo.id },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const reservar = (
    entrada: string,
    salida: string,
    extra: { adultos?: number; tipoDocumento?: string } = {},
  ) => {
    const cuerpo = cuerpoReserva(dobleId, entrada, salida);
    return http()
      .post('/reservas')
      .send({
        ...cuerpo,
        adultos: extra.adultos,
        huesped: { ...cuerpo.huesped, tipoDocumento: extra.tipoDocumento ?? 'CC' },
      });
  };

  it('cobra IVA del 19 % a un huésped con cédula', async () => {
    const res = await reservar('2030-03-10', '2030-03-12').expect(201);

    expect(res.body.desglose.subtotal).toBe(200000);
    expect(res.body.desglose.iva).toEqual({ porcentaje: 19, valor: 38000, exento: false });
    expect(Number(res.body.valorAlojamiento)).toBe(238000);
  });

  it('exime de IVA al huésped con pasaporte (extranjero no residente)', async () => {
    const res = await reservar('2030-03-10', '2030-03-12', { tipoDocumento: 'PASAPORTE' }).expect(
      201,
    );

    expect(res.body.desglose.iva.exento).toBe(true);
    expect(Number(res.body.valorAlojamiento)).toBe(200000);
  });

  it('cobra cada noche según su temporada y congela el desglose', async () => {
    // 12 y 13 abr: baja; 14 abr: Domingo de Ramos (alta).
    const res = await reservar('2030-04-12', '2030-04-15', { tipoDocumento: 'PASAPORTE' }).expect(
      201,
    );

    expect(
      res.body.desglose.noches.map((n: { fecha: string; temporada: string; tarifa: number }) => [
        n.fecha,
        n.temporada,
        n.tarifa,
      ]),
    ).toEqual([
      ['2030-04-12', 'baja', 100000],
      ['2030-04-13', 'baja', 100000],
      ['2030-04-14', 'alta', 130000],
    ]);
    expect(Number(res.body.valorAlojamiento)).toBe(330000);

    const guardada = await prisma.reserva.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(guardada.desglose).toEqual(res.body.desglose);
  });

  it('suma el cargo por persona adicional y guarda el número de huéspedes', async () => {
    const res = await reservar('2030-03-10', '2030-03-12', {
      adultos: 3,
      tipoDocumento: 'PASAPORTE',
    }).expect(201);

    expect(res.body.numeroHuespedes).toBe(3);
    expect(res.body.desglose.personasAdicionales).toBe(1);
    expect(Number(res.body.valorAlojamiento)).toBe(200000 + 2 * 40000);
  });

  it('rechaza con 400 más huéspedes que la capacidad máxima (R6)', async () => {
    const res = await reservar('2030-03-10', '2030-03-12', { adultos: 4 }).expect(400);
    expect(res.body.message).toMatch(/máximo 3 huéspedes/);
  });

  it('la penalidad tardía es la primera noche con su temporada, adicional e IVA', async () => {
    // Llega el 14 de abril (alta) con 3 huéspedes; cancela 1 día antes.
    const { body } = await reservar('2030-04-14', '2030-04-16', { adultos: 3 }).expect(201);
    reloj.fijar('2030-04-13T10:00:00-05:00');

    const res = await http().post(`/reservas/${body.id}/cancelar`).expect(201);

    // (130.000 + 40.000) × 1,19
    expect(Number(res.body.total)).toBe(202300);
  });

  it('cambiar la tarifa del tipo solo afecta a las reservas nuevas (R5)', async () => {
    const antes = await reservar('2030-03-10', '2030-03-11', { tipoDocumento: 'PASAPORTE' }).expect(
      201,
    );
    await prisma.tipoHabitacion.updateMany({ data: { tarifaBase: 150000 } });
    await http().post(`/reservas/${antes.body.id}/cancelar`).expect(201);

    const despues = await reservar('2030-03-10', '2030-03-11', {
      tipoDocumento: 'PASAPORTE',
    }).expect(201);

    expect(Number(antes.body.valorAlojamiento)).toBe(100000);
    expect(Number(despues.body.valorAlojamiento)).toBe(150000);
  });

  describe('disponibilidad con precio', () => {
    it('cotiza cada habitación disponible para el rango y los huéspedes', async () => {
      const res = await http()
        .get('/habitaciones/disponibles')
        .query({ desde: '2030-03-10', hasta: '2030-03-12', adultos: 3 })
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].cotizacion.subtotal).toBe(280000);
      expect(res.body[0].cotizacion.total).toBe(333200); // con IVA
    });

    it('excluye habitaciones sin capacidad para los huéspedes', async () => {
      const res = await http()
        .get('/habitaciones/disponibles')
        .query({ desde: '2030-03-10', hasta: '2030-03-12', adultos: 4 })
        .expect(200);

      expect(res.body).toEqual([]);
    });
  });

  describe('GET /tarifas/temporadas', () => {
    it('devuelve el calendario del año con multiplicadores e IVA', async () => {
      const res = await http().get('/tarifas/temporadas').query({ anio: 2030 }).expect(200);

      expect(res.body.anio).toBe(2030);
      expect(res.body.multiplicadores).toEqual({ baja: 1, media: 1.15, alta: 1.3 });
      expect(res.body.ivaPorcentaje).toBe(19);
      const semanaSanta = res.body.periodos.find(
        (p: { motivo: string }) => p.motivo === 'Semana Santa',
      );
      expect([semanaSanta.desde, semanaSanta.hasta]).toEqual([
        '2030-04-14T00:00:00.000Z',
        '2030-04-20T00:00:00.000Z',
      ]);
    });

    it('por defecto usa el año actual del hotel', async () => {
      const res = await http().get('/tarifas/temporadas').expect(200);
      expect(res.body.anio).toBe(2030);
    });
  });
});
