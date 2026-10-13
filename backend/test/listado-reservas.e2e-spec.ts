import { INestApplication } from '@nestjs/common';
import type TestAgent from 'supertest/lib/agent';
import { PrismaService } from '../src/prisma/prisma.service';
import { crearApp, crearHabitacion, limpiarBD } from './utilidades';

// GET /reservas: paginado, de la más reciente a la más antigua, con filtros.
describe('Listado de reservas', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: () => TestAgent;

  beforeAll(async () => {
    ({ app, prisma, http } = await crearApp());
  });

  beforeEach(async () => {
    await limpiarBD(prisma);
    const h101 = await crearHabitacion(prisma, { numero: '101' });
    const h102 = await crearHabitacion(prisma, { numero: '102' });

    // 5 reservas en la 101 (meses distintos) y 1 en la 102 de "Ana Ruiz".
    for (let mes = 2; mes <= 6; mes++) {
      await http()
        .post('/reservas')
        .send({
          habitacionId: h101.id,
          huesped: { nombre: `Huésped ${mes}`, documento: `DOC${mes}` },
          fechaEntrada: `2030-0${mes}-10`,
          fechaSalida: `2030-0${mes}-12`,
        })
        .expect(201);
    }
    const ana = await http()
      .post('/reservas')
      .send({
        habitacionId: h102.id,
        huesped: { nombre: 'Ana Ruiz', documento: '52.123.456' },
        fechaEntrada: '2030-03-10',
        fechaSalida: '2030-03-12',
      })
      .expect(201);
    await http().post(`/reservas/${ana.body.id}/cancelar`).expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  const listar = async (query: object = {}) =>
    (await http().get('/reservas').query(query).expect(200)).body;

  it('pagina el resultado y dice cuántas hay en total', async () => {
    const primera = await listar({ porPagina: 4 });
    expect(primera).toMatchObject({ total: 6, pagina: 1, porPagina: 4, paginas: 2 });
    expect(primera.datos).toHaveLength(4);

    const segunda = await listar({ porPagina: 4, pagina: 2 });
    expect(segunda.datos).toHaveLength(2);
    // Sin repetidos entre páginas.
    const ids = [...primera.datos, ...segunda.datos].map((r: { id: string }) => r.id);
    expect(new Set(ids).size).toBe(6);
  });

  it('ordena de la más reciente a la más antigua', async () => {
    const { datos } = await listar();
    expect(datos[0].huesped.nombre).toBe('Ana Ruiz');
  });

  it('filtra por estado', async () => {
    const { datos, total } = await listar({ estado: 'cancelada' });
    expect(total).toBe(1);
    expect(datos[0].huesped.nombre).toBe('Ana Ruiz');
  });

  it('busca por nombre, documento (con o sin puntos) o número de habitación', async () => {
    expect((await listar({ buscar: 'ana' })).total).toBe(1);
    expect((await listar({ buscar: '52.123' })).total).toBe(1);
    expect((await listar({ buscar: '102' })).total).toBe(1);
    expect((await listar({ buscar: '101' })).total).toBe(5);
  });

  it('rechaza parámetros inválidos', async () => {
    await http().get('/reservas').query({ estado: 'perdida' }).expect(400);
    await http().get('/reservas').query({ pagina: 0 }).expect(400);
    await http().get('/reservas').query({ porPagina: 500 }).expect(400);
  });
});
