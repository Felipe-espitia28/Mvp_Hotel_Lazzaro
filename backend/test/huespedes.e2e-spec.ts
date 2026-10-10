import { INestApplication } from '@nestjs/common';
import type TestAgent from 'supertest/lib/agent';
import { PrismaService } from '../src/prisma/prisma.service';
import { crearApp, crearHabitacion, limpiarBD } from './utilidades';

// Un huésped se identifica por tipo + número de documento y no se duplica.
describe('Huéspedes', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: () => TestAgent;
  let comoRecepcionista: TestAgent;
  let h101: string;
  let h102: string;

  beforeAll(async () => {
    ({ app, prisma, http, comoRecepcionista } = await crearApp());
  });

  beforeEach(async () => {
    await limpiarBD(prisma);
    h101 = (await crearHabitacion(prisma, { numero: '101' })).id;
    h102 = (await crearHabitacion(prisma, { numero: '102' })).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const reservar = (
    habitacionId: string,
    entrada: string,
    huesped: { nombre: string; documento: string; tipoDocumento?: string; telefono?: string },
  ) =>
    http()
      .post('/reservas')
      .send({ habitacionId, huesped, fechaEntrada: entrada, fechaSalida: '2030-03-05' })
      .expect(201);

  describe('al reservar', () => {
    it('reutiliza al huésped que vuelve en lugar de duplicarlo', async () => {
      const primera = await reservar(h101, '2030-03-01', {
        nombre: 'Ana Ruiz',
        documento: '52123456',
      });
      await http().post(`/reservas/${primera.body.id}/cancelar`).expect(201);
      const segunda = await reservar(h102, '2030-03-01', {
        nombre: 'Ana Ruiz',
        documento: '52123456',
      });

      expect(segunda.body.huespedId).toBe(primera.body.huespedId);
      expect(await prisma.huesped.count()).toBe(1);
    });

    it('reconoce el documento escrito con puntos o espacios', async () => {
      const a = await reservar(h101, '2030-03-01', { nombre: 'Ana', documento: '1.020.304.050' });
      const b = await reservar(h102, '2030-03-01', { nombre: 'Ana', documento: '1020 304 050' });

      expect(b.body.huespedId).toBe(a.body.huespedId);
      expect(a.body.huesped.documento).toBe('1020304050');
    });

    it('conserva el nombre registrado y actualiza el teléfono', async () => {
      await reservar(h101, '2030-03-01', { nombre: 'Ana Ruiz', documento: '777', telefono: '300' });
      const res = await reservar(h102, '2030-03-01', {
        nombre: 'Otro Nombre',
        documento: '777',
        telefono: '311',
      });

      expect(res.body.huesped.nombre).toBe('Ana Ruiz');
      expect(res.body.huesped.telefono).toBe('311');
    });

    it('el mismo número con otro tipo de documento es otra persona', async () => {
      const cedula = await reservar(h101, '2030-03-01', { nombre: 'A', documento: '999' });
      const pasaporte = await reservar(h102, '2030-03-01', {
        nombre: 'B',
        documento: '999',
        tipoDocumento: 'PASAPORTE',
      });

      expect(pasaporte.body.huespedId).not.toBe(cedula.body.huespedId);
      expect(cedula.body.huesped.tipoDocumento).toBe('CC');
    });

    it('rechaza con 400 un tipo de documento inexistente', async () => {
      await http()
        .post('/reservas')
        .send({
          habitacionId: h101,
          huesped: { nombre: 'A', documento: '1', tipoDocumento: 'LICENCIA' },
          fechaEntrada: '2030-03-01',
          fechaSalida: '2030-03-02',
        })
        .expect(400);
    });

    it('dos reservas simultáneas de un huésped nuevo crean un solo registro', async () => {
      const datos = { nombre: 'Nuevo', documento: '424242' };
      await Promise.all([reservar(h101, '2030-03-01', datos), reservar(h102, '2030-03-01', datos)]);

      expect(await prisma.huesped.count()).toBe(1);
      expect(await prisma.reserva.count()).toBe(2);
    });
  });

  describe('consulta', () => {
    beforeEach(async () => {
      await reservar(h101, '2030-03-01', { nombre: 'Ana Ruiz', documento: '52123456' });
      await reservar(h102, '2030-03-01', { nombre: 'Andrés Gil', documento: '80111222' });
    });

    it('busca por inicio del documento o por parte del nombre', async () => {
      const porDocumento = await http().get('/huespedes').query({ buscar: '5212' }).expect(200);
      expect(porDocumento.body.map((h: { nombre: string }) => h.nombre)).toEqual(['Ana Ruiz']);

      const porNombre = await http().get('/huespedes').query({ buscar: 'an' }).expect(200);
      expect(porNombre.body.map((h: { nombre: string }) => h.nombre)).toEqual([
        'Ana Ruiz',
        'Andrés Gil',
      ]);
      expect(porNombre.body[0]._count.reservas).toBe(1);
    });

    it('encuentra a un huésped por su documento exacto (para el formulario de reserva)', async () => {
      const res = await http().get('/huespedes/documento/CC/52.123.456').expect(200);
      expect(res.body.nombre).toBe('Ana Ruiz');

      await http().get('/huespedes/documento/CC/000').expect(404);
      await http().get('/huespedes/documento/LICENCIA/52123456').expect(400);
    });

    it('muestra la ficha con el historial de estadías', async () => {
      const { body: lista } = await http().get('/huespedes').query({ buscar: 'Ana' });

      const res = await http().get(`/huespedes/${lista[0].id}`).expect(200);

      expect(res.body.reservas).toHaveLength(1);
      expect(res.body.reservas[0].habitacion.numero).toBe('101');
    });

    it('recepción puede consultar huéspedes', async () => {
      await comoRecepcionista.get('/huespedes').query({ buscar: 'Ana' }).expect(200);
    });

    it('responde 404 para un huésped inexistente', async () => {
      await http().get('/huespedes/no-existe').expect(404);
    });
  });
});
