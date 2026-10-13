import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  CONTRASENA_PRUEBA,
  USUARIOS_PRUEBA,
  crearApp,
  crearHabitacion,
  cuerpoReserva,
  limpiarBD,
} from './utilidades';

describe('Usuarios y permisos', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: () => TestAgent; // sesión de administrador
  let comoRecepcionista: TestAgent;

  beforeAll(async () => {
    ({ app, prisma, http, comoRecepcionista } = await crearApp());
  });

  beforeEach(async () => {
    await limpiarBD(prisma);
    // Borra los usuarios creados por pruebas anteriores (no los fijos).
    await prisma.usuario.deleteMany({
      where: { email: { notIn: Object.values(USUARIOS_PRUEBA).map((u) => u.email) } },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const sinSesion = () => request(app.getHttpServer());

  const login = (email: string, contrasena: string) =>
    sinSesion().post('/auth/login').send({ email, contrasena });

  const nuevoUsuario = (datos: Partial<Record<string, string>> = {}) =>
    http()
      .post('/usuarios')
      .send({
        nombre: 'Laura Recepción',
        email: 'laura@hotel.test',
        contrasena: 'clave-segura-1',
        rol: 'recepcionista',
        ...datos,
      });

  describe('autenticación', () => {
    it('rechaza con 401 las peticiones sin sesión', async () => {
      await sinSesion().get('/reservas').expect(401);
      await sinSesion().get('/habitaciones').expect(401);
      await sinSesion().post('/reservas/no-shows/procesar').expect(401);
    });

    it('rechaza con 401 un token inventado', async () => {
      await sinSesion().get('/reservas').set('Authorization', 'Bearer inventado').expect(401);
    });

    it('inicia sesión y devuelve token, rol y permisos, nunca la contraseña', async () => {
      await nuevoUsuario().expect(201);

      const res = await login('laura@hotel.test', 'clave-segura-1').expect(200);

      expect(res.body.usuario).toMatchObject({ email: 'laura@hotel.test', rol: 'recepcionista' });
      expect(res.body.usuario.permisos).toContain('reservas:gestionar');
      expect(res.body.usuario.permisos).not.toContain('usuarios:gestionar');
      expect(JSON.stringify(res.body)).not.toMatch(/contrasena|scrypt/i);

      const yo = await sinSesion()
        .get('/auth/yo')
        .set('Authorization', `Bearer ${res.body.token}`)
        .expect(200);
      expect(yo.body.email).toBe('laura@hotel.test');
    });

    it('el correo no distingue mayúsculas ni espacios', async () => {
      await nuevoUsuario().expect(201);
      await login('  Laura@Hotel.TEST ', 'clave-segura-1').expect(200);
    });

    it('da el mismo error para contraseña incorrecta y correo inexistente', async () => {
      await nuevoUsuario().expect(201);

      const malaClave = await login('laura@hotel.test', 'otra-clave').expect(401);
      const sinCuenta = await login('nadie@hotel.test', 'clave-segura-1').expect(401);
      expect(malaClave.body.message).toBe(sinCuenta.body.message);
    });

    it('cambia la propia contraseña verificando la actual', async () => {
      await nuevoUsuario().expect(201);
      const { token } = (await login('laura@hotel.test', 'clave-segura-1')).body;
      const conSesion = (ruta: string) =>
        sinSesion().post(ruta).set('Authorization', `Bearer ${token}`);

      await conSesion('/auth/cambiar-contrasena')
        .send({ actual: 'equivocada', nueva: 'clave-nueva-2' })
        .expect(400);
      await conSesion('/auth/cambiar-contrasena')
        .send({ actual: 'clave-segura-1', nueva: 'clave-nueva-2' })
        .expect(204);

      await login('laura@hotel.test', 'clave-segura-1').expect(401);
      await login('laura@hotel.test', 'clave-nueva-2').expect(200);
    });
  });

  describe('permisos por rol', () => {
    it('recepción opera reservas y estadías', async () => {
      const habitacion = await crearHabitacion(prisma);

      await comoRecepcionista.get('/habitaciones').expect(200);
      await comoRecepcionista.get('/reservas').expect(200);
      const res = await comoRecepcionista
        .post('/reservas')
        .send(cuerpoReserva(habitacion.id, '2030-01-01', '2030-01-03'))
        .expect(201);
      await comoRecepcionista
        .post(`/reservas/${res.body.id}/check-in`)
        .send({ nacionalidad: 'CO', procedencia: 'Bogotá', motivoViaje: 'turismo' })
        .expect(201);
      await comoRecepcionista.post('/reservas/no-shows/procesar').expect(200);
    });

    it('recepción no puede crear habitaciones ni gestionar usuarios (403)', async () => {
      await comoRecepcionista
        .post('/habitaciones')
        .send({ numero: '999', tipo: 'suite', tarifaNoche: 1 })
        .expect(403);
      await comoRecepcionista.get('/usuarios').expect(403);
      await comoRecepcionista
        .post('/usuarios')
        .send({ nombre: 'X', email: 'x@hotel.test', contrasena: 'clave-segura-1', rol: 'admin' })
        .expect(403);
    });

    it('un cambio de rol aplica de inmediato, sin volver a iniciar sesión', async () => {
      const { body } = await nuevoUsuario({ rol: 'admin' }).expect(201);
      const { token } = (await login('laura@hotel.test', 'clave-segura-1')).body;
      const usuarios = () => sinSesion().get('/usuarios').set('Authorization', `Bearer ${token}`);

      await usuarios().expect(200);
      await http().patch(`/usuarios/${body.id}`).send({ rol: 'recepcionista' }).expect(200);
      await usuarios().expect(403);
    });
  });

  describe('gestión de usuarios (admin)', () => {
    it('crea y lista usuarios sin exponer contraseñas', async () => {
      const creado = await nuevoUsuario().expect(201);
      expect(creado.body).toMatchObject({ email: 'laura@hotel.test', activo: true });

      const lista = await http().get('/usuarios').expect(200);
      expect(lista.body.map((u: { email: string }) => u.email)).toContain('laura@hotel.test');
      expect(JSON.stringify(lista.body)).not.toMatch(/contrasena|scrypt/i);
    });

    it('rechaza con 409 un correo repetido (sin importar mayúsculas)', async () => {
      await nuevoUsuario().expect(201);
      await nuevoUsuario({ email: 'LAURA@hotel.test' }).expect(409);
    });

    it.each([
      ['contraseña corta', { contrasena: 'corta' }],
      ['correo inválido', { email: 'no-es-correo' }],
      ['rol inexistente', { rol: 'gerente' }],
    ])('rechaza con 400: %s', async (_caso, datos) => {
      await nuevoUsuario(datos).expect(400);
    });

    it('desactivar a un usuario corta su sesión de inmediato y le impide entrar', async () => {
      const { body } = await nuevoUsuario().expect(201);
      const { token } = (await login('laura@hotel.test', 'clave-segura-1')).body;

      await http().patch(`/usuarios/${body.id}`).send({ activo: false }).expect(200);

      await sinSesion().get('/reservas').set('Authorization', `Bearer ${token}`).expect(401);
      await login('laura@hotel.test', 'clave-segura-1').expect(401);

      // Reactivado, vuelve a entrar.
      await http().patch(`/usuarios/${body.id}`).send({ activo: true }).expect(200);
      await login('laura@hotel.test', 'clave-segura-1').expect(200);
    });

    it('un administrador no puede desactivarse ni quitarse el rol', async () => {
      const yo = await prisma.usuario.findUniqueOrThrow({
        where: { email: USUARIOS_PRUEBA.admin.email },
      });

      await http().patch(`/usuarios/${yo.id}`).send({ activo: false }).expect(400);
      await http().patch(`/usuarios/${yo.id}`).send({ rol: 'recepcionista' }).expect(400);
      // Cambiar su propio nombre sí puede.
      await http().patch(`/usuarios/${yo.id}`).send({ nombre: 'Admin Prueba' }).expect(200);
    });

    it('restablece la contraseña de otro usuario', async () => {
      const { body } = await nuevoUsuario().expect(201);

      await http()
        .post(`/usuarios/${body.id}/restablecer-contrasena`)
        .send({ nueva: 'restablecida-3' })
        .expect(204);

      await login('laura@hotel.test', 'restablecida-3').expect(200);
    });

    it('responde 404 para un usuario inexistente', async () => {
      await http().patch('/usuarios/no-existe').send({ activo: false }).expect(404);
    });
  });

  it('los usuarios de prueba pueden iniciar sesión con la contraseña de prueba', async () => {
    await login(USUARIOS_PRUEBA.recepcionista.email, CONTRASENA_PRUEBA).expect(200);
  });
});
