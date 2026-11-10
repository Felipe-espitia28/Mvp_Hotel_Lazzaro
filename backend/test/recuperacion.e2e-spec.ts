import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  AHORA_POR_DEFECTO,
  CONTRASENA_PRUEBA,
  HOTELES_PRUEBA,
  RelojFalso,
  USUARIOS_PRUEBA,
  bandejaDeCorreo,
  crearApp,
  reiniciar,
} from './utilidades';

// Plan 18 (R73): "¿Olvidaste tu contraseña?" con un enlace de un solo uso.
describe('Recuperación de la contraseña', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reloj: RelojFalso;
  const correo = USUARIOS_PRUEBA.recepcionista.email;

  const servidor = () => request(app.getHttpServer());
  const recuperar = (email: string) => servidor().post('/auth/recuperar').send({ email });
  const restablecer = (token: string, nueva: string) =>
    servidor().post('/auth/restablecer').send({ token, nueva });
  const login = (email: string, contrasena: string) =>
    servidor().post('/auth/login').send({ email, contrasena });
  // El token del último enlace que le llegó a ese correo.
  const tokenDe = (email: string) => {
    const texto = [...bandejaDeCorreo()].reverse().find((c) => c.para === email)?.texto ?? '';
    const token = texto.match(/restablecer\?token=([\w-]+)/)?.[1];
    if (!token) throw new Error(`No llegó un enlace a ${email}`);
    return token;
  };

  beforeAll(async () => {
    ({ app, prisma, reloj } = await crearApp());
  });

  beforeEach(async () => {
    await reiniciar(prisma, reloj);
  });

  afterAll(async () => {
    reloj.fijar(AHORA_POR_DEFECTO);
    await app.close();
  });

  it('envía un enlace que cambia la contraseña y cierra las sesiones', async () => {
    const { body: sesion } = await login(correo, CONTRASENA_PRUEBA).expect(200);
    await recuperar(correo).expect(204);
    await restablecer(tokenDe(correo), 'nueva-clave-2026').expect(204);

    await login(correo, CONTRASENA_PRUEBA).expect(401);
    await login(correo, 'nueva-clave-2026').expect(200);
    await servidor().get('/auth/yo').set('Authorization', `Bearer ${sesion.token}`).expect(401);
    expect(bandejaDeCorreo().at(-1)?.asunto).toMatch(/contraseña cambió/);
  });

  it('responde 204 sin enviar nada si el correo no existe, está inactivo o su hotel suspendido', async () => {
    await recuperar('nadie@hotel.test').expect(204);
    await prisma.usuario.update({ where: { email: correo }, data: { activo: false } });
    await recuperar(correo).expect(204);
    await prisma.usuario.update({ where: { email: correo }, data: { activo: true } });
    await prisma.hotel.update({
      where: { id: HOTELES_PRUEBA.principal.id },
      data: { activo: false },
    });
    await recuperar(correo).expect(204);
    expect(bandejaDeCorreo()).toEqual([]);
    expect(await prisma.tokenRecuperacion.count()).toBe(0);
  });

  it('el enlace es de un solo uso: de dos usos simultáneos, gana uno', async () => {
    await recuperar(correo).expect(204);
    const token = tokenDe(correo);
    const respuestas = await Promise.all([
      restablecer(token, 'primera-clave-2026'),
      restablecer(token, 'segunda-clave-2026'),
    ]);
    expect(respuestas.map((r) => r.status).sort()).toEqual([204, 400]);
    await restablecer(token, 'tercera-clave-2026').expect(400);
  });

  it('vence a los 30 minutos y uno nuevo invalida el anterior', async () => {
    await recuperar(correo).expect(204);
    const primero = tokenDe(correo);
    reloj.fijar('2030-01-01T12:31:00-05:00');
    await restablecer(primero, 'tarde-clave-2026').expect(400);

    await recuperar(correo).expect(204);
    const segundo = tokenDe(correo);
    await recuperar(correo).expect(204);
    const tercero = tokenDe(correo);
    await restablecer(segundo, 'vieja-clave-2026').expect(400);
    await restablecer(tercero, 'buena-clave-2026').expect(204);
  });

  it('aplica la política sin gastar el enlace', async () => {
    await recuperar(correo).expect(204);
    const token = tokenDe(correo);
    const { body } = await restablecer(token, 'sololetrasaqui').expect(400);
    expect(body.message).toMatch(/letras y números/);
    await restablecer(token, 'recepcion2026').expect(400); // contiene el correo
    await restablecer(token, 'valida-clave-2026').expect(204);
  });

  it('el registro de envíos no guarda el enlace', async () => {
    await recuperar(correo).expect(204);
    const token = tokenDe(correo);
    const filas = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM correo_enviado`;
    expect(filas).toHaveLength(1);
    expect(JSON.stringify(filas)).not.toContain(token);
    // Ni el token: solo su hash.
    expect(JSON.stringify(await prisma.tokenRecuperacion.findMany())).not.toContain(token);
  });

  describe('límite de intentos', () => {
    let appLimitada: INestApplication;
    const anterior = process.env.LOGIN_INTENTOS_POR_MINUTO;

    beforeAll(async () => {
      process.env.LOGIN_INTENTOS_POR_MINUTO = '3';
      ({ app: appLimitada } = await crearApp());
    });

    afterAll(async () => {
      process.env.LOGIN_INTENTOS_POR_MINUTO = anterior;
      await appLimitada.close();
    });

    it('bloquea con 429 tras demasiadas solicitudes seguidas', async () => {
      const pedir = () =>
        request(appLimitada.getHttpServer())
          .post('/auth/recuperar')
          .send({ email: 'alguien@hotel.test' });
      for (let i = 0; i < 3; i++) await pedir().expect(204);
      const bloqueado = await pedir().expect(429);
      expect(bloqueado.body.message).toMatch(/Demasiadas peticiones/);
    });
  });
});
