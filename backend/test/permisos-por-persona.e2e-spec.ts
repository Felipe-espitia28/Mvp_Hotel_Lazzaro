import { INestApplication } from '@nestjs/common';
import type TestAgent from 'supertest/lib/agent';
import { PrismaService } from '../src/prisma/prisma.service';
import { permisosDeUsuario } from '../src/auth/permisos-efectivos';
import {
  HOTEL_PRUEBA_ID,
  RelojFalso,
  USUARIOS_PRUEBA,
  crearApp,
  personaConRol,
  reiniciar,
  rolDelHotel,
} from './utilidades';
import { HOTEL_ANTIGUO, probarMigracion } from './migraciones';

// Plan 19: ajustes de permisos por persona (R75), no editarse a sí mismo,
// el alta de un hotel con sus roles y la migración desde los roles fijos.
describe('Permisos por persona', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reloj: RelojFalso;
  let http: () => TestAgent; // admin del hotel principal
  let comoPlataforma: TestAgent;
  const roles = { admin: '', recepcion: '', camarera: '' };

  const idDe = async (email: string) =>
    (await prisma.usuario.findUniqueOrThrow({ where: { email } })).id;

  beforeAll(async () => {
    ({ app, prisma, reloj, http, comoPlataforma } = await crearApp());
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

  it('un agregado da acceso y un quitado lo retira aunque el rol lo tenga', async () => {
    const { usuario: rosa, sesion: comoRosa } = await personaConRol(app, prisma, {
      email: 'rosa@prueba.test',
      rolId: roles.camarera,
    });
    await comoRosa.get('/reservas').expect(403);
    await http()
      .patch(`/usuarios/${rosa.id}`)
      .send({ permisosAgregados: ['reservas:ver'] })
      .expect(200);
    await comoRosa.get('/reservas').expect(200);
    expect((await comoRosa.get('/auth/yo').expect(200)).body.permisos).toContain('reservas:ver');

    const { usuario: rec, sesion: comoRec } = await personaConRol(app, prisma, {
      email: 'rec@prueba.test',
      rolId: roles.recepcion,
    });
    await comoRec.get('/turnos/actual').expect(200);
    await http()
      .patch(`/usuarios/${rec.id}`)
      .send({ permisosQuitados: ['caja:turno'] })
      .expect(200);
    await comoRec.get('/turnos/actual').expect(403);

    // La lista del equipo muestra el rol, los ajustes y lo que puede de verdad.
    const { body: equipo } = await http().get('/usuarios').expect(200);
    const fila = equipo.find((u: { id: string }) => u.id === rec.id);
    expect(fila).toMatchObject({
      rol: { nombre: 'Recepción' },
      permisosQuitados: ['caja:turno'],
      tieneAjustes: true,
    });
    expect(fila.permisosEfectivos).not.toContain('caja:turno');
    // Queda en la auditoría de la cuenta.
    expect(
      await prisma.eventoUsuario.findFirst({
        where: { usuarioId: rec.id, tipo: 'permisos_ajustados' },
      }),
    ).toMatchObject({
      detalle: { antes: { quitados: [] }, despues: { quitados: ['caja:turno'] } },
    });
  });

  it('los ajustes cumplen las dependencias y el catálogo', async () => {
    const { usuario } = await personaConRol(app, prisma, {
      email: 'rosa@prueba.test',
      rolId: roles.camarera,
    });
    const ruta = `/usuarios/${usuario.id}`;
    const { body } = await http()
      .patch(ruta)
      .send({ permisosAgregados: ['reservas:gestionar'] })
      .expect(400);
    expect(body.message).toMatch(/necesita "Ver reservas y huéspedes"/);
    // Quitar un requisito de lo que queda también se rechaza.
    await http()
      .patch(ruta)
      .send({ permisosQuitados: ['habitaciones:ver'] })
      .expect(400);
    await http()
      .patch(ruta)
      .send({ permisosAgregados: ['plataforma:gestionar'] })
      .expect(400);
  });

  it('nadie cambia su propio rol, sus ajustes ni se desactiva', async () => {
    const yo = await idDe(USUARIOS_PRUEBA.admin.email);
    for (const cambio of [
      { rolId: roles.recepcion },
      { permisosAgregados: ['reservas:ver'] },
      { permisosQuitados: ['pagos:anular'] },
      { activo: false },
    ]) {
      await http().patch(`/usuarios/${yo}`).send(cambio).expect(400);
    }
    await http().patch(`/usuarios/${yo}`).send({ nombre: 'Admin Prueba' }).expect(200);
  });

  it('un cambio de rol queda en la auditoría de la cuenta', async () => {
    const { usuario } = await personaConRol(app, prisma, {
      email: 'rosa@prueba.test',
      rolId: roles.camarera,
    });
    await http().patch(`/usuarios/${usuario.id}`).send({ rolId: roles.recepcion }).expect(200);
    expect(
      await prisma.eventoUsuario.findFirst({
        where: { usuarioId: usuario.id, tipo: 'rol_cambiado' },
      }),
    ).toMatchObject({ detalle: { antes: { rol: 'Camarera' }, despues: { rol: 'Recepción' } } });
  });

  it('un hotel nuevo nace con los roles de las plantillas; sin Administrador no se crea', async () => {
    const personas = (plantilla: string) => [
      { nombre: 'Persona', email: 'persona@nuevo.test', plantilla },
    ];
    await comoPlataforma
      .post('/plataforma/hoteles')
      .send({ nombre: 'Nuevo', slug: 'nuevo', personas: personas('Recepción') })
      .expect(400);
    const { body: hotel } = await comoPlataforma
      .post('/plataforma/hoteles')
      .send({ nombre: 'Nuevo', slug: 'nuevo', personas: personas('Administrador') })
      .expect(201);
    const { body: suyos } = await comoPlataforma
      .get(`/plataforma/hoteles/${hotel.id}/roles`)
      .expect(200);
    expect(suyos.map((r: { nombre: string }) => r.nombre)).toEqual([
      'Administrador',
      'Camarera',
      'Recepción',
    ]);
    const persona = await prisma.usuario.findUniqueOrThrow({
      where: { email: 'persona@nuevo.test' },
      include: { rol: true },
    });
    expect(persona.rol?.nombre).toBe('Administrador');
    expect(persona.rol?.permisos).toContain('roles:gestionar');
  });

  it('la migración deja a cada usuario con los mismos permisos que tenía', async () => {
    // Foto de PERMISOS_POR_ROL antes del plan 19.
    const OPERACION_DIARIA = [
      'habitaciones:ver',
      'habitaciones:estado',
      'reservas:ver',
      'reservas:gestionar',
      'estadias:gestionar',
      'folio:gestionar',
      'no-shows:procesar',
      'reportes-legales:ver',
      'agenda:gestionar',
      'caja:turno',
      'limpieza:gestionar',
      'limpieza:asignar',
    ];
    const ANTES: Record<string, string[]> = {
      recepcionista: OPERACION_DIARIA,
      admin: [
        ...OPERACION_DIARIA,
        'habitaciones:gestionar',
        'usuarios:gestionar',
        'hotel:configurar',
        'pagos:anular',
        'cuentas:por-cobrar',
        'panel:gerencia',
        'caja:supervisar',
        'pagos:configurar',
      ],
      housekeeping: ['habitaciones:ver', 'limpieza:gestionar'],
      plataforma: ['plataforma:gestionar'],
    };
    const usuarios = [
      ['a1', 'h1', 'admin'],
      ['r1', 'h1', 'recepcionista'],
      ['c1', 'h1', 'housekeeping'],
      ['a2', 'h2', 'admin'],
      ['p1', null, 'plataforma'],
    ] as const;
    await probarMigracion(
      '20261110000000_roles_personalizados',
      [
        HOTEL_ANTIGUO[0],
        `INSERT INTO hotel (id, slug, nombre) VALUES ('h2', 'otro', 'Otro')`,
        ...usuarios.map(
          ([id, hotel, rol]) =>
            `INSERT INTO usuario (id, hotel_id, nombre, email, contrasena_hash, rol)
             VALUES ('${id}', ${hotel ? `'${hotel}'` : 'NULL'}, '${id}', '${id}@h.test', 'x', '${rol}')`,
        ),
      ],
      async (cliente) => {
        // 3 por hotel (la base trae además el hotel que crea una migración anterior).
        expect(await cliente.rolHotel.count({ where: { hotelId: { in: ['h1', 'h2'] } } })).toBe(6);
        for (const [id, hotel, rolAnterior] of usuarios) {
          const u = await cliente.usuario.findUniqueOrThrow({
            where: { id },
            select: {
              tipo: true,
              hotelId: true,
              rol: { select: { id: true, nombre: true, permisos: true, hotelId: true } },
              permisosAgregados: true,
              permisosQuitados: true,
            },
          });
          expect(u.hotelId).toBe(hotel);
          if (hotel) expect(u.rol?.hotelId).toBe(hotel);
          // Nadie gana ni pierde permisos: el Administrador solo gana roles:gestionar.
          const esperado =
            rolAnterior === 'admin' ? [...ANTES.admin, 'roles:gestionar'] : ANTES[rolAnterior];
          expect([...permisosDeUsuario(u)].sort()).toEqual([...esperado].sort());
        }
      },
    );
  }, 180000);
});
