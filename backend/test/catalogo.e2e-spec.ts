import { INestApplication } from '@nestjs/common';
import type TestAgent from 'supertest/lib/agent';
import { PrismaService } from '../src/prisma/prisma.service';
import { RelojFalso, crearApp, crearHabitacion, cuerpoReserva, reiniciar } from './utilidades';

// Catálogo de consumos del hotel (R22): recepción carga al folio productos con
// su precio; el cargo copia el valor y no cambia si el catálogo cambia.
describe('Catálogo de consumos', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reloj: RelojFalso;
  let http: () => TestAgent; // admin
  let comoRecepcionista: TestAgent;
  let comoOtroHotel: TestAgent;
  let reservaId: string;

  const crearProducto = (datos: Record<string, unknown>) =>
    http().post('/productos').send(datos).expect(201);

  beforeAll(async () => {
    ({ app, prisma, reloj, http, comoRecepcionista, comoOtroHotel } = await crearApp());
  });

  beforeEach(async () => {
    await reiniciar(prisma, reloj);
    const habitacion = await crearHabitacion(prisma);
    const res = await http()
      .post('/reservas')
      .send(cuerpoReserva(habitacion.id, '2030-03-10', '2030-03-12'))
      .expect(201);
    reservaId = res.body.id;
    reloj.fijar('2030-03-10T15:00:00-05:00');
    await http()
      .post(`/reservas/${reservaId}/check-in`)
      .send({ nacionalidad: 'CO', procedencia: 'Bogotá', motivoViaje: 'turismo' })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it('carga un producto del catálogo con su precio', async () => {
    const { body: agua } = await crearProducto({
      nombre: 'Agua 600 ml',
      categoria: 'minibar',
      precio: 6000,
    });

    const { body: folio } = await comoRecepcionista
      .post(`/reservas/${reservaId}/cargos`)
      .send({ productoId: agua.id, cantidad: 3 })
      .expect(201);
    expect(folio.cargos[0]).toMatchObject({
      productoId: agua.id,
      concepto: 'Agua 600 ml',
      categoria: 'minibar',
      valorUnitario: '6000',
      total: '18000',
    });
  });

  it('cambiar el precio en el catálogo no altera los cargos ya hechos', async () => {
    const { body: agua } = await crearProducto({
      nombre: 'Agua 600 ml',
      categoria: 'minibar',
      precio: 6000,
    });
    await http()
      .post(`/reservas/${reservaId}/cargos`)
      .send({ productoId: agua.id, cantidad: 1 })
      .expect(201);

    await http().patch(`/productos/${agua.id}`).send({ precio: 8000 }).expect(200);
    const { body: folio } = await http()
      .post(`/reservas/${reservaId}/cargos`)
      .send({ productoId: agua.id, cantidad: 1 })
      .expect(201);
    expect(folio.cargos.map((c: { total: string }) => c.total)).toEqual(['6000', '8000']);
  });

  it('sigue admitiendo consumos con valor libre', async () => {
    await http()
      .post(`/reservas/${reservaId}/cargos`)
      .send({
        categoria: 'restaurante',
        concepto: 'Cena a la carta',
        cantidad: 1,
        valorUnitario: 68000,
      })
      .expect(201);
    // Sin producto, el valor libre es obligatorio.
    await http().post(`/reservas/${reservaId}/cargos`).send({ cantidad: 1 }).expect(400);
  });

  it('un producto desactivado ya no se puede cargar', async () => {
    const { body: snack } = await crearProducto({
      nombre: 'Snack',
      categoria: 'minibar',
      precio: 7000,
    });
    await http().patch(`/productos/${snack.id}`).send({ activo: false }).expect(200);
    await http()
      .post(`/reservas/${reservaId}/cargos`)
      .send({ productoId: snack.id, cantidad: 1 })
      .expect(404);
  });

  it('no repite nombres, valida el precio y solo el administrador lo edita', async () => {
    await crearProducto({ nombre: 'Gaseosa', categoria: 'minibar', precio: 5000 });
    await http()
      .post('/productos')
      .send({ nombre: 'Gaseosa', categoria: 'minibar', precio: 5000 })
      .expect(409);
    await http()
      .post('/productos')
      .send({ nombre: 'Gratis', categoria: 'minibar', precio: 0 })
      .expect(400);
    await comoRecepcionista
      .post('/productos')
      .send({ nombre: 'Café', categoria: 'restaurante', precio: 4000 })
      .expect(403);
    // Recepción sí ve el catálogo para cargar consumos.
    const { body } = await comoRecepcionista.get('/productos').expect(200);
    expect(body).toHaveLength(1);
  });

  it('cada hotel tiene su catálogo', async () => {
    const { body: agua } = await crearProducto({
      nombre: 'Agua 600 ml',
      categoria: 'minibar',
      precio: 6000,
    });
    const { body } = await comoOtroHotel.get('/productos').expect(200);
    expect(body).toEqual([]);
    await comoOtroHotel.patch(`/productos/${agua.id}`).send({ precio: 1 }).expect(404);
    // El mismo nombre puede existir en otro hotel.
    await comoOtroHotel
      .post('/productos')
      .send({ nombre: 'Agua 600 ml', categoria: 'minibar', precio: 4500 })
      .expect(201);
  });
});
