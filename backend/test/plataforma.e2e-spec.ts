import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { PrismaService } from '../src/prisma/prisma.service';
import { HOTELES_PRUEBA, RelojFalso, USUARIOS_PRUEBA, crearApp, reiniciar } from './utilidades';

const CONTRASENA = 'clave-del-hotel';

const nuevoHotel = (cambios: Record<string, unknown> = {}) => ({
  nombre: 'Sol Caribe',
  slug: 'sol-caribe',
  ciudad: 'Cartagena',
  colorPrimario: '#0e7c86',
  colorAcento: '#f2994a',
  fuenteTitulos: 'Montserrat',
  personas: [
    {
      nombre: 'Gerente Sol',
      email: 'gerente@solcaribe.test',
      rol: 'admin',
      contrasena: CONTRASENA,
    },
    {
      nombre: 'Recepción Sol',
      email: 'recepcion@solcaribe.test',
      rol: 'recepcionista',
      contrasena: CONTRASENA,
    },
  ],
  ...cambios,
});

// Consola Lazaro: el equipo de Lazaro da de alta hoteles y el acceso de su gente.
describe('Consola Lazaro', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reloj: RelojFalso;
  let http: () => TestAgent; // admin de un hotel
  let comoRecepcionista: TestAgent;
  let comoPlataforma: TestAgent;

  const login = (email: string, contrasena = CONTRASENA) =>
    request(app.getHttpServer()).post('/auth/login').send({ email, contrasena });

  beforeAll(async () => {
    ({ app, prisma, reloj, http, comoRecepcionista, comoPlataforma } = await crearApp());
  });

  beforeEach(async () => {
    await reiniciar(prisma, reloj);
  });

  afterAll(async () => {
    await app.close();
  });

  it('crea un hotel listo para usar: marca, tipos de habitación y personas con acceso', async () => {
    const { body: hotel } = await comoPlataforma
      .post('/plataforma/hoteles')
      .send(nuevoHotel())
      .expect(201);
    expect(hotel).toMatchObject({ nombre: 'Sol Caribe', slug: 'sol-caribe', activo: true });

    // El administrador del hotel entra y ve SU hotel, con su marca.
    const { body: sesion } = await login('gerente@solcaribe.test').expect(200);
    expect(sesion.usuario).toMatchObject({ rol: 'admin', hotelId: hotel.id });
    const gerente = request
      .agent(app.getHttpServer())
      .set('Authorization', `Bearer ${sesion.token}`);
    const { body: suHotel } = await gerente.get('/hotel').expect(200);
    expect(suHotel).toMatchObject({
      nombre: 'Sol Caribe',
      colorPrimario: '#0e7c86',
      fuenteTitulos: 'Montserrat',
    });
    // Nace con los tipos de habitación sugeridos y las políticas por defecto.
    const { body: tipos } = await gerente.get('/tipos-habitacion').expect(200);
    expect(tipos.map((t: { codigo: string }) => t.codigo).sort()).toEqual([
      'doble',
      'sencilla',
      'suite',
    ]);
    expect(suHotel.politicas.horasCancelacionGratuita).toBe(48);

    // Aparece en la lista de la consola con sus indicadores.
    const { body: lista } = await comoPlataforma.get('/plataforma/hoteles').expect(200);
    expect(lista.find((h: { id: string }) => h.id === hotel.id)).toMatchObject({
      usuarios: 2,
      habitaciones: 0,
      reservasDelMes: 0,
    });
  });

  it('exige al menos un administrador y datos válidos', async () => {
    await comoPlataforma
      .post('/plataforma/hoteles')
      .send(nuevoHotel({ personas: [nuevoHotel().personas[1]] }))
      .expect(400);
    await comoPlataforma
      .post('/plataforma/hoteles')
      .send(nuevoHotel({ slug: 'Sol Caribe!' }))
      .expect(400);
    await comoPlataforma
      .post('/plataforma/hoteles')
      .send(nuevoHotel({ colorPrimario: 'azul' }))
      .expect(400);
    await comoPlataforma
      .post('/plataforma/hoteles')
      .send(nuevoHotel({ fuenteTitulos: 'Comic Sans' }))
      .expect(400);
    // Nadie recibe el rol plataforma desde el alta de un hotel.
    await comoPlataforma
      .post('/plataforma/hoteles')
      .send(
        nuevoHotel({
          personas: [{ ...nuevoHotel().personas[0], rol: 'plataforma' }],
        }),
      )
      .expect(400);
  });

  it('no repite identificadores ni correos, y no deja nada a medias', async () => {
    await comoPlataforma.post('/plataforma/hoteles').send(nuevoHotel()).expect(201);
    await comoPlataforma
      .post('/plataforma/hoteles')
      .send(nuevoHotel({ personas: [{ ...nuevoHotel().personas[0], email: 'otro@x.test' }] }))
      .expect(409);

    // Un correo que ya tiene acceso: el hotel no se crea.
    await comoPlataforma
      .post('/plataforma/hoteles')
      .send(
        nuevoHotel({
          slug: 'otro-sol',
          personas: [{ ...nuevoHotel().personas[0], email: USUARIOS_PRUEBA.admin.email }],
        }),
      )
      .expect(409);
    expect(await prisma.hotel.findUnique({ where: { slug: 'otro-sol' } })).toBeNull();
  });

  it('suspende y reactiva un hotel', async () => {
    const { body: hotel } = await comoPlataforma
      .post('/plataforma/hoteles')
      .send(nuevoHotel())
      .expect(201);

    await comoPlataforma
      .patch(`/plataforma/hoteles/${hotel.id}`)
      .send({ activo: false })
      .expect(200);
    const rechazo = await login('recepcion@solcaribe.test').expect(401);
    expect(rechazo.body.message).toMatch(/suspendido/);

    await comoPlataforma
      .patch(`/plataforma/hoteles/${hotel.id}`)
      .send({ activo: true })
      .expect(200);
    await login('recepcion@solcaribe.test').expect(200);
  });

  it('gestiona el acceso de las personas de cualquier hotel', async () => {
    const id = HOTELES_PRUEBA.principal.id;
    const { body: nueva } = await comoPlataforma
      .post(`/plataforma/hoteles/${id}/usuarios`)
      .send({
        nombre: 'Nueva',
        email: 'nueva@prueba.test',
        rol: 'recepcionista',
        contrasena: CONTRASENA,
      })
      .expect(201);
    await login('nueva@prueba.test').expect(200);

    const { body: personas } = await comoPlataforma
      .get(`/plataforma/hoteles/${id}/usuarios`)
      .expect(200);
    expect(personas.map((p: { email: string }) => p.email)).toContain('nueva@prueba.test');

    await comoPlataforma
      .patch(`/plataforma/hoteles/${id}/usuarios/${nueva.id}`)
      .send({ activo: false })
      .expect(200);
    await login('nueva@prueba.test').expect(401);

    // Una persona de otro hotel no se toca desde la ruta de este.
    await comoPlataforma
      .patch(`/plataforma/hoteles/${HOTELES_PRUEBA.otro.id}/usuarios/${nueva.id}`)
      .send({ activo: true })
      .expect(404);
    await comoPlataforma.get('/plataforma/hoteles/no-existe/usuarios').expect(404);
  });

  it('la consola es solo del equipo de Lazaro', async () => {
    await http().get('/plataforma/hoteles').expect(403);
    await comoRecepcionista.post('/plataforma/hoteles').send(nuevoHotel()).expect(403);
  });

  it('el administrador edita los datos de su hotel; recepción no', async () => {
    const { body } = await http()
      .patch('/hotel')
      .send({ nombre: 'Hotel Prueba Centro', nit: '900123' })
      .expect(200);
    expect(body).toMatchObject({ nombre: 'Hotel Prueba Centro', nit: '900123' });
    await comoRecepcionista.get('/hotel').expect(200);
    await comoRecepcionista.patch('/hotel').send({ nombre: 'X' }).expect(403);
    await comoPlataforma.get('/hotel').expect(403);
  });
});
