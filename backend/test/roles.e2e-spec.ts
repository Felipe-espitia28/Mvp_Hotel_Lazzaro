import { INestApplication } from '@nestjs/common';
import type TestAgent from 'supertest/lib/agent';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  HOTELES_PRUEBA,
  HOTEL_PRUEBA_ID,
  RelojFalso,
  USUARIOS_PRUEBA,
  crearApp,
  personaConRol,
  reiniciar,
  rolDelHotel,
} from './utilidades';

// Plan 19: roles personalizados por hotel (R75–R80).
describe('Roles por hotel', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reloj: RelojFalso;
  let http: () => TestAgent; // admin del hotel principal
  let comoOtroHotel: TestAgent;
  let comoPlataforma: TestAgent;
  const roles = { admin: '', recepcion: '', camarera: '' };

  const idDe = async (email: string) =>
    (await prisma.usuario.findUniqueOrThrow({ where: { email } })).id;
  const crearRol = (cuerpo: object, como: TestAgent = http()) => como.post('/roles').send(cuerpo);

  beforeAll(async () => {
    ({ app, prisma, reloj, http, comoOtroHotel, comoPlataforma } = await crearApp());
  });

  beforeEach(async () => {
    await reiniciar(prisma, reloj);
    roles.admin = (await rolDelHotel(prisma, HOTEL_PRUEBA_ID, 'Administrador')).id;
    roles.recepcion = (await rolDelHotel(prisma, HOTEL_PRUEBA_ID, 'Recepción')).id;
    roles.camarera = (await rolDelHotel(prisma, HOTEL_PRUEBA_ID, 'Camarera')).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('un rol "Auditor nocturno" da solo lo que tiene', async () => {
    const { body: rol } = await crearRol({
      nombre: 'Auditor nocturno',
      descripcion: 'Revisa la noche',
      permisos: ['reservas:ver', 'reportes-legales:ver'],
    }).expect(201);
    const { sesion } = await personaConRol(app, prisma, {
      email: 'noche@prueba.test',
      rolId: rol.id,
    });

    await sesion.get('/reservas').expect(200);
    await sesion
      .get('/reportes-legales/pendientes')
      .query({ desde: '2030-01-01', hasta: '2030-01-31' })
      .expect(200);
    await sesion.post('/reservas').send({}).expect(403);
    await sesion.post('/turnos/abrir').send({ baseEfectivo: 0 }).expect(403);
    const { body: yo } = await sesion.get('/auth/yo').expect(200);
    expect(yo).toMatchObject({ tipo: 'hotel', rol: { id: rol.id, nombre: 'Auditor nocturno' } });
    expect([...yo.permisos].sort()).toEqual(['reportes-legales:ver', 'reservas:ver']);
  });

  it('editar un rol aplica de inmediato, con el mismo token', async () => {
    const { body: rol } = await crearRol({ nombre: 'Noche', permisos: ['reservas:ver'] }).expect(
      201,
    );
    const { sesion } = await personaConRol(app, prisma, {
      email: 'noche@prueba.test',
      rolId: rol.id,
    });
    await sesion.get('/turnos/actual').expect(403);

    const { body } = await http()
      .patch(`/roles/${rol.id}`)
      .send({ permisos: ['reservas:ver', 'caja:turno'] })
      .expect(200);
    expect(body.personasAfectadas).toBe(1);
    await sesion.get('/turnos/actual').expect(200);

    await http()
      .patch(`/roles/${rol.id}`)
      .send({ permisos: ['reservas:ver'] })
      .expect(200);
    await sesion.get('/turnos/actual').expect(403);
  });

  it('valida dependencias y nombres (únicos por hotel sin importar mayúsculas)', async () => {
    const { body } = await crearRol({ nombre: 'Malo', permisos: ['reservas:gestionar'] }).expect(
      400,
    );
    expect(body.message).toMatch(/necesita "Ver reservas y huéspedes"/);
    await crearRol({ nombre: 'Inventado', permisos: ['no:existe'] }).expect(400);

    await crearRol({ nombre: 'Auditor nocturno', permisos: [] }).expect(201);
    await crearRol({ nombre: 'auditor NOCTURNO', permisos: [] }).expect(409);
    // El mismo nombre en otro hotel está permitido.
    await crearRol({ nombre: 'Auditor nocturno', permisos: [] }, comoOtroHotel).expect(201);
    // Duplicar copia los permisos.
    const { body: copia } = await crearRol({
      nombre: 'Recepción de noche',
      duplicarDe: roles.recepcion,
    }).expect(201);
    expect([...copia.permisos].sort()).toEqual(
      [...(await rolDelHotel(prisma, HOTEL_PRUEBA_ID, 'Recepción')).permisos].sort(),
    );
  });

  it('nadie da lo que no tiene (la Consola sí puede asignar)', async () => {
    // Un jefe que gestiona el equipo y los roles, pero no anula pagos.
    const { body: jefe } = await crearRol({
      nombre: 'Jefe de recepción',
      permisos: ['reservas:ver', 'usuarios:gestionar', 'roles:gestionar'],
    }).expect(201);
    const { sesion } = await personaConRol(app, prisma, {
      email: 'jefe@prueba.test',
      rolId: jefe.id,
    });

    const { body } = await crearRol(
      { nombre: 'Con anulación', permisos: ['reservas:ver', 'folio:gestionar', 'pagos:anular'] },
      sesion,
    ).expect(403);
    expect(body.message).toMatch(/Anular pagos registrados/);
    // Ni asignar un rol que lo incluye, ni darlo como ajuste.
    await sesion
      .post('/usuarios')
      .send({ nombre: 'X', email: 'x@prueba.test', rolId: roles.admin })
      .expect(403);
    await sesion
      .patch(`/usuarios/${await idDe(USUARIOS_PRUEBA.recepcionista.email)}`)
      .send({ permisosAgregados: ['pagos:anular'] })
      .expect(403);
    // La Consola Lazaro es el proveedor: sí puede.
    await comoPlataforma
      .post(`/plataforma/hoteles/${HOTEL_PRUEBA_ID}/usuarios`)
      .send({ nombre: 'Gerente', email: 'gerente@prueba.test', rolId: roles.admin })
      .expect(201);
  });

  describe('regla de gobierno (R78)', () => {
    const MENSAJE = /al menos una persona activa que pueda gestionar el equipo y los roles/;

    it('no se le quita roles:gestionar al rol del único gobernante', async () => {
      const antes = await rolDelHotel(prisma, HOTEL_PRUEBA_ID, 'Administrador');
      const sinRoles = antes.permisos.filter((p) => p !== 'roles:gestionar');
      const { body: vista } = await http()
        .post(`/roles/${roles.admin}/vista-previa`)
        .send({ permisos: sinRoles })
        .expect(200);
      expect(vista).toMatchObject({
        personasAfectadas: 1,
        pierden: ['roles:gestionar'],
        rompeGobierno: true,
      });

      const { body } = await http()
        .patch(`/roles/${roles.admin}`)
        .send({ permisos: sinRoles })
        .expect(409);
      expect(body.message).toMatch(MENSAJE);
      expect((await rolDelHotel(prisma, HOTEL_PRUEBA_ID, 'Administrador')).permisos).toEqual(
        antes.permisos,
      );
    });

    it('la Consola no le cambia el rol, ni se lo recorta, ni desactiva al último gobernante', async () => {
      const admin = await idDe(USUARIOS_PRUEBA.admin.email);
      const ruta = `/plataforma/hoteles/${HOTEL_PRUEBA_ID}/usuarios/${admin}`;
      await comoPlataforma.patch(ruta).send({ rolId: roles.recepcion }).expect(409);
      await comoPlataforma
        .patch(ruta)
        .send({ permisosQuitados: ['roles:gestionar'] })
        .expect(409);
      await comoPlataforma.patch(ruta).send({ activo: false }).expect(409);
      expect(await prisma.usuario.findUniqueOrThrow({ where: { id: admin } })).toMatchObject({
        activo: true,
        rolId: roles.admin,
        permisosQuitados: [],
      });
    });

    it('no se elimina el rol de los gobernantes reasignándolos a uno sin esos permisos', async () => {
      await http()
        .delete(`/roles/${roles.admin}`)
        .send({ reasignarA: roles.recepcion })
        .expect(409);
      expect(await prisma.rolHotel.count({ where: { id: roles.admin } })).toBe(1);
    });

    it('dos gobernantes que se quitan el permiso a la vez: siempre queda uno', async () => {
      const admin = await idDe(USUARIOS_PRUEBA.admin.email);
      for (let vuelta = 0; vuelta < 10; vuelta++) {
        await prisma.usuario.deleteMany({ where: { email: 'otro-admin@prueba.test' } });
        await prisma.usuario.update({ where: { id: admin }, data: { permisosQuitados: [] } });
        const { usuario: otro, sesion } = await personaConRol(app, prisma, {
          email: 'otro-admin@prueba.test',
          rolId: roles.admin,
        });
        const quitar = { permisosQuitados: ['roles:gestionar'] };
        const respuestas = await Promise.all([
          http().patch(`/usuarios/${otro.id}`).send(quitar),
          sesion.patch(`/usuarios/${admin}`).send(quitar),
        ]);
        expect(respuestas.map((r) => r.status).sort()).toEqual([200, 409]);
        const quedan = await prisma.usuario.count({
          where: {
            hotelId: HOTEL_PRUEBA_ID,
            rolId: roles.admin,
            permisosQuitados: { isEmpty: true },
          },
        });
        expect(quedan).toBe(1);
      }
    });
  });

  it('eliminar un rol mueve a sus personas; el último rol del hotel no se elimina', async () => {
    const { body: rol } = await crearRol({ nombre: 'Temporal', permisos: ['reservas:ver'] }).expect(
      201,
    );
    const { usuario } = await personaConRol(app, prisma, {
      email: 'temp@prueba.test',
      rolId: rol.id,
    });
    const { body } = await http().delete(`/roles/${rol.id}`).send({}).expect(400);
    expect(body.message).toMatch(/elige a qué rol moverlas/);

    await http().delete(`/roles/${rol.id}`).send({ reasignarA: roles.recepcion }).expect(204);
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } })).rolId).toBe(
      roles.recepcion,
    );
    expect(
      await prisma.eventoUsuario.findFirst({
        where: { usuarioId: usuario.id, tipo: 'rol_cambiado' },
      }),
    ).toMatchObject({ detalle: { antes: { rol: 'Temporal' }, despues: { rol: 'Recepción' } } });

    // En el otro hotel solo hay un administrador: se quitan los otros roles y el último no se va.
    const otro = HOTELES_PRUEBA.otro.id;
    for (const nombre of ['Recepción', 'Camarera']) {
      await comoOtroHotel
        .delete(`/roles/${(await rolDelHotel(prisma, otro, nombre)).id}`)
        .expect(204);
    }
    const { body: ultimo } = await comoOtroHotel
      .delete(`/roles/${(await rolDelHotel(prisma, otro, 'Administrador')).id}`)
      .send({})
      .expect(400);
    expect(ultimo.message).toMatch(/último rol/);
  });

  it('aislamiento: los roles de otro hotel no se ven, no se tocan y no se asignan', async () => {
    const ajeno = (await rolDelHotel(prisma, HOTELES_PRUEBA.otro.id, 'Recepción')).id;
    await http().get(`/roles/${ajeno}`).expect(404);
    await http().patch(`/roles/${ajeno}`).send({ nombre: 'Mío' }).expect(404);
    await http().delete(`/roles/${ajeno}`).send({}).expect(404);
    const recepcion = await idDe(USUARIOS_PRUEBA.recepcionista.email);
    await http().patch(`/usuarios/${recepcion}`).send({ rolId: ajeno }).expect(404);
    // Aunque se fuerce en la base, la llave compuesta (rol_id, hotel_id) lo rechaza.
    await expect(
      prisma.usuario.update({ where: { id: recepcion }, data: { rolId: ajeno } }),
    ).rejects.toThrow();
    const { body } = await http().get('/roles').expect(200);
    expect(body.map((r: { nombre: string }) => r.nombre).sort()).toEqual([
      'Administrador',
      'Camarera',
      'Recepción',
    ]);
  });

  it('cada cambio de un rol queda en la auditoría con su antes y su después', async () => {
    const { body: rol } = await crearRol({ nombre: 'Noche', permisos: ['reservas:ver'] }).expect(
      201,
    );
    await http()
      .patch(`/roles/${rol.id}`)
      .send({ nombre: 'Noches', permisos: ['reservas:ver', 'caja:turno'] })
      .expect(200);
    const eventos = await prisma.eventoRol.findMany({
      where: { hotelId: HOTEL_PRUEBA_ID },
      orderBy: { fecha: 'asc' },
    });
    expect(eventos.map((e) => e.tipo)).toEqual(['creado', 'editado']);
    expect(eventos[1].detalle).toEqual({
      antes: { nombre: 'Noche', permisos: ['reservas:ver'] },
      despues: { nombre: 'Noches', permisos: ['reservas:ver', 'caja:turno'] },
    });
    expect(eventos[1].actorId).toBe(await idDe(USUARIOS_PRUEBA.admin.email));
  });

  it('el catálogo agrupa los permisos; recepción no gestiona roles', async () => {
    const { body } = await http().get('/roles/catalogo').expect(200);
    expect(body.permisos).toHaveLength(21);
    expect(body.plantillas.map((p: { nombre: string }) => p.nombre)).toEqual([
      'Administrador',
      'Recepción',
      'Camarera',
    ]);
    const { sesion } = await personaConRol(app, prisma, {
      email: 'rec@prueba.test',
      rolId: roles.recepcion,
    });
    await sesion.get('/roles').expect(403);
    await sesion.post('/roles').send({ nombre: 'X', permisos: [] }).expect(403);
  });
});
