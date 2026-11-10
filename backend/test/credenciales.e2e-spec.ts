import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { CorreoSimulado } from '../src/correo/correo-simulado.adaptador';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  AHORA_POR_DEFECTO,
  HOTELES_PRUEBA,
  RelojFalso,
  bandejaDeCorreo,
  crearApp,
  reiniciar,
  temporalDe,
} from './utilidades';

// Plan 18 (R70–R72, R74): credenciales por correo, contraseña temporal y
// cambio obligatorio en el primer ingreso.
describe('Credenciales por correo y contraseña temporal', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reloj: RelojFalso;
  let http: () => TestAgent; // admin del hotel
  let comoPlataforma: TestAgent;

  const servidor = () => request(app.getHttpServer());
  const login = (email: string, contrasena: string) =>
    servidor().post('/auth/login').send({ email, contrasena });
  const con = (token: string) => ({
    get: (ruta: string) => servidor().get(ruta).set('Authorization', `Bearer ${token}`),
    post: (ruta: string) => servidor().post(ruta).set('Authorization', `Bearer ${token}`),
  });
  const crearLaura = () =>
    http()
      .post('/usuarios')
      .send({ nombre: 'Laura Recepción', email: 'laura@hotel.test', rol: 'recepcionista' });

  beforeAll(async () => {
    ({ app, prisma, reloj, http, comoPlataforma } = await crearApp());
  });

  beforeEach(async () => {
    await reiniciar(prisma, reloj);
  });

  afterAll(async () => {
    CorreoSimulado.fallar = false;
    reloj.fijar(AHORA_POR_DEFECTO);
    await app.close();
  });

  it('crear un usuario envía la temporal; con ella solo puede crear su contraseña', async () => {
    const { body: creado } = await crearLaura().expect(201);
    expect(creado).toMatchObject({ debeCambiarContrasena: true, correoEnviado: true });
    const [correo] = bandejaDeCorreo();
    expect(correo).toMatchObject({ para: 'laura@hotel.test', nombre: 'Laura Recepción' });
    expect(correo.asunto).toContain('Hotel Prueba');
    expect(correo.texto).toContain('/?hotel=hotel-prueba');

    const temporal = temporalDe('laura@hotel.test');
    const { body: sesion } = await login('laura@hotel.test', temporal).expect(200);
    expect(sesion.usuario.debeCambiarContrasena).toBe(true);

    // Se hace cumplir en el servidor: todo lo demás da 403 con el código.
    const { body: bloqueo } = await con(sesion.token).get('/reservas').expect(403);
    expect(bloqueo.codigo).toBe('CAMBIO_CONTRASENA_REQUERIDO');
    await con(sesion.token).get('/auth/yo').expect(200);

    // La política aplica (R72): no puede ser la temporal ni corta.
    await con(sesion.token)
      .post('/auth/cambiar-contrasena')
      .send({ actual: temporal, nueva: temporal })
      .expect(400);
    await con(sesion.token)
      .post('/auth/cambiar-contrasena')
      .send({ actual: temporal, nueva: 'sololetrassinnumeros' })
      .expect(400);
    await con(sesion.token)
      .post('/auth/cambiar-contrasena')
      .send({ actual: temporal, nueva: 'laura2026segura' })
      .expect(400);

    const { body: nueva } = await con(sesion.token)
      .post('/auth/cambiar-contrasena')
      .send({ actual: temporal, nueva: 'montana-verde-2026' })
      .expect(200);
    expect(nueva.usuario.debeCambiarContrasena).toBe(false);
    await con(nueva.token).get('/reservas').expect(200);
    // R74: el token anterior queda rechazado.
    await con(sesion.token).get('/auth/yo').expect(401);
    // Llega el aviso de seguridad.
    expect(bandejaDeCorreo().at(-1)?.asunto).toMatch(/contraseña cambió/);
    expect(
      await prisma.eventoUsuario.findMany({
        where: { usuarioId: creado.id },
        select: { tipo: true },
        orderBy: { fecha: 'asc' },
      }),
    ).toEqual([
      { tipo: 'creado' },
      { tipo: 'credenciales_enviadas' },
      { tipo: 'contrasena_cambiada' },
    ]);
  });

  it('la temporal vence a las 72 horas', async () => {
    await crearLaura().expect(201);
    const temporal = temporalDe('laura@hotel.test');
    reloj.fijar('2030-01-04T12:00:00-05:00');
    await login('laura@hotel.test', temporal).expect(401);
    reloj.fijar('2030-01-04T11:59:00-05:00');
    await login('laura@hotel.test', temporal).expect(200);
    reloj.fijar('2030-01-04T12:01:00-05:00');
    const { body } = await login('laura@hotel.test', temporal).expect(401);
    expect(body.message).toMatch(/temporal venció/);
  });

  it('reenviar credenciales cierra la sesión abierta y la temporal anterior deja de servir', async () => {
    const { body: creado } = await crearLaura().expect(201);
    const anterior = temporalDe('laura@hotel.test');
    const { body: sesion } = await login('laura@hotel.test', anterior).expect(200);

    await http().post(`/usuarios/${creado.id}/reenviar-credenciales`).expect(200);
    await con(sesion.token).get('/auth/yo').expect(401);
    await login('laura@hotel.test', anterior).expect(401);
    const nueva = temporalDe('laura@hotel.test');
    expect(nueva).not.toBe(anterior);
    expect(bandejaDeCorreo().at(-1)?.asunto).toMatch(/nuevas credenciales/);
    await login('laura@hotel.test', nueva).expect(200);
  });

  it('si el correo falla, el usuario queda creado y se le pueden reenviar las credenciales', async () => {
    CorreoSimulado.fallar = true;
    const { body: creado } = await crearLaura().expect(201);
    expect(creado.correoEnviado).toBe(false);
    expect(
      await prisma.correoEnviado.findMany({ select: { estado: true, plantilla: true } }),
    ).toEqual([{ estado: 'fallido', plantilla: 'credenciales' }]);
    expect(await prisma.eventoUsuario.count({ where: { tipo: 'credenciales_enviadas' } })).toBe(0);

    CorreoSimulado.fallar = false;
    const { body } = await http().post(`/usuarios/${creado.id}/reenviar-credenciales`).expect(200);
    expect(body).toEqual({ correoEnviado: true });
    await login('laura@hotel.test', temporalDe('laura@hotel.test')).expect(200);
  });

  it('el registro de envíos no guarda la contraseña temporal', async () => {
    await crearLaura().expect(201);
    const temporal = temporalDe('laura@hotel.test');
    const [fila] = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM correo_enviado`;
    expect(fila).toMatchObject({ estado: 'enviado', destinatario: 'laura@hotel.test' });
    expect(JSON.stringify(fila)).not.toContain(temporal);
  });

  it('la Consola crea usuarios y hoteles con su equipo por el mismo camino', async () => {
    await comoPlataforma
      .post(`/plataforma/hoteles/${HOTELES_PRUEBA.principal.id}/usuarios`)
      .send({ nombre: 'Nueva', email: 'nueva@prueba.test', rol: 'recepcionista' })
      .expect(201);
    await login('nueva@prueba.test', temporalDe('nueva@prueba.test')).expect(200);

    const { body: hotel } = await comoPlataforma
      .post('/plataforma/hoteles')
      .send({
        nombre: 'Sol Caribe',
        slug: 'sol-caribe',
        personas: [
          { nombre: 'Gerente Sol', email: 'gerente@solcaribe.test', rol: 'admin' },
          { nombre: 'Recepción Sol', email: 'recepcion@solcaribe.test', rol: 'recepcionista' },
        ],
      })
      .expect(201);
    expect(hotel.correosFallidos).toEqual([]);
    const paraSol = bandejaDeCorreo().filter((c) => c.para.endsWith('@solcaribe.test'));
    expect(paraSol.map((c) => c.para).sort()).toEqual([
      'gerente@solcaribe.test',
      'recepcion@solcaribe.test',
    ]);
    expect(paraSol[0].texto).toContain('/?hotel=sol-caribe');
    await login('gerente@solcaribe.test', temporalDe('gerente@solcaribe.test')).expect(200);

    // La Consola también reenvía.
    const sol = await prisma.usuario.findUniqueOrThrow({
      where: { email: 'recepcion@solcaribe.test' },
    });
    await comoPlataforma
      .post(`/plataforma/hoteles/${hotel.id}/usuarios/${sol.id}/reenviar-credenciales`)
      .expect(200);
  });

  it('los usuarios existentes no deben cambiar su contraseña', async () => {
    await http().get('/reservas').expect(200);
    expect(await prisma.usuario.count({ where: { debeCambiarContrasena: true } })).toBe(0);
  });
});
