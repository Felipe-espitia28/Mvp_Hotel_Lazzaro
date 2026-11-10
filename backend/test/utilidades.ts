import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configurarApp } from '../src/configurar-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { Reloj } from '../src/hotel/reloj';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { cifrarContrasena } from '../src/auth/contrasenas';
import { CorreoSimulado } from '../src/correo/correo-simulado.adaptador';
import { PLANTILLAS_DE_ROL } from '../src/auth/permisos';
import { TEMPORADAS_INICIALES } from '../src/hotel/datos-iniciales';

// "Ahora" por defecto en las pruebas (hora de Colombia): las fechas de 2030
// que usan las pruebas quedan en el futuro y dentro de la antelación máxima.
export const AHORA_POR_DEFECTO = '2030-01-01T12:00:00-05:00';

// Reloj controlable: las pruebas de cancelación y no-show mueven la hora.
export class RelojFalso extends Reloj {
  private instante = new Date(AHORA_POR_DEFECTO);

  ahora() {
    return new Date(this.instante);
  }

  fijar(iso: string) {
    this.instante = new Date(iso);
  }
}

// Levanta la app completa (controladores + servicios + Prisma real) con la
// misma configuración global que main.ts; solo se reemplaza el reloj.
export async function crearApp() {
  const reloj = new RelojFalso();
  const modulo = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(Reloj)
    .useValue(reloj)
    .compile();

  const app: INestApplication = modulo.createNestApplication();
  configurarApp(app);
  // Escucha una sola vez en un puerto libre: así supertest no abre un servidor
  // por cada petición (importante en la prueba de concurrencia).
  await app.listen(0);

  const prisma = app.get(PrismaService);
  for (const hotel of Object.values(HOTELES_PRUEBA)) {
    await prisma.hotel.upsert({ where: { id: hotel.id }, update: {}, create: hotel });
  }
  await restaurarRolesDePrueba(prisma);
  const comoAdmin = await clienteCon(app, prisma, USUARIOS_PRUEBA.admin);
  const comoRecepcionista = await clienteCon(app, prisma, USUARIOS_PRUEBA.recepcionista);
  const comoCamarera = await clienteCon(app, prisma, USUARIOS_PRUEBA.housekeeping);
  const comoOtroHotel = await clienteCon(app, prisma, USUARIOS_PRUEBA.adminOtroHotel);
  const comoPlataforma = await clienteCon(app, prisma, USUARIOS_PRUEBA.plataforma);

  // http(): cliente con sesión de administrador del hotel de pruebas (puede
  // hacer todo), para las pruebas que no tratan sobre permisos.
  return {
    app,
    prisma,
    reloj,
    http: () => comoAdmin,
    comoRecepcionista,
    comoCamarera,
    comoOtroHotel,
    comoPlataforma,
  };
}

// Dos hoteles de prueba: casi todas las pruebas usan el primero; el segundo
// existe para comprobar que un hotel nunca ve ni toca los datos del otro.
export const HOTELES_PRUEBA = {
  principal: {
    id: '00000000-0000-4000-8000-0000000000a1',
    slug: 'hotel-prueba',
    nombre: 'Hotel Prueba',
  },
  otro: { id: '00000000-0000-4000-8000-0000000000b2', slug: 'otro-hotel', nombre: 'Otro Hotel' },
} as const;
export const HOTEL_PRUEBA_ID = HOTELES_PRUEBA.principal.id;

// Usuarios fijos de las pruebas. limpiarBD no borra la tabla de usuarios.
export const USUARIOS_PRUEBA = {
  admin: {
    email: 'admin@prueba.test',
    nombre: 'Admin Prueba',
    plantilla: 'Administrador',
    hotelId: HOTELES_PRUEBA.principal.id,
  },
  recepcionista: {
    email: 'recepcion@prueba.test',
    nombre: 'Recepción Prueba',
    plantilla: 'Recepción',
    hotelId: HOTELES_PRUEBA.principal.id,
  },
  // B-4: camarera del hotel principal.
  housekeeping: {
    email: 'camarera@prueba.test',
    nombre: 'Camarera Prueba',
    plantilla: 'Camarera',
    hotelId: HOTELES_PRUEBA.principal.id,
  },
  adminOtroHotel: {
    email: 'admin@otro-hotel.test',
    nombre: 'Admin Otro Hotel',
    plantilla: 'Administrador',
    hotelId: HOTELES_PRUEBA.otro.id,
  },
  plataforma: {
    email: 'plataforma@lazaro.test',
    nombre: 'Equipo Lazaro',
    plantilla: null,
    hotelId: null,
  },
} as const;

export const CONTRASENA_PRUEBA = 'contrasena-de-prueba';

// Crea (si no existe) un usuario activo y devuelve un cliente HTTP que envía su token.
async function clienteCon(
  app: INestApplication,
  prisma: PrismaService,
  datos: (typeof USUARIOS_PRUEBA)[keyof typeof USUARIOS_PRUEBA],
) {
  const contrasenaHash = await cifrarContrasena(CONTRASENA_PRUEBA);
  const { plantilla, ...identidad } = datos;
  // Plan 19: el rol de la plantilla en su hotel (la Consola no tiene rol).
  const acceso = plantilla
    ? {
        tipo: 'hotel' as const,
        rolId: (await rolDelHotel(prisma, datos.hotelId!, plantilla)).id,
        permisosAgregados: [],
        permisosQuitados: [],
      }
    : { tipo: 'plataforma' as const, rolId: null };
  const usuario = await prisma.usuario.upsert({
    where: { email: datos.email },
    // Plan 18: los usuarios fijos entran sin contraseña temporal pendiente.
    update: {
      activo: true,
      hotelId: datos.hotelId,
      ...acceso,
      contrasenaHash,
      debeCambiarContrasena: false,
      contrasenaTemporalVenceEn: null,
      versionSesion: 0,
    },
    create: { ...identidad, ...acceso, contrasenaHash },
  });
  const token = await app.get(JwtService).signAsync({ sub: usuario.id, ver: 0 });
  return request.agent(app.getHttpServer()).set('Authorization', `Bearer ${token}`);
}

// Prepara cada prueba: base vacía y reloj en la hora por defecto.
export async function reiniciar(prisma: PrismaService, reloj: RelojFalso) {
  reloj.fijar(AHORA_POR_DEFECTO);
  await limpiarBD(prisma);
  vaciarBandeja();
}

// Vacía todas las tablas entre pruebas. Se niega a correr si la URL no es la
// de la base de pruebas, para no borrar datos de desarrollo por accidente.
export async function limpiarBD(prisma: PrismaService) {
  if (!process.env.DATABASE_URL?.includes('_test')) {
    throw new Error('limpiarBD solo puede ejecutarse sobre una base de pruebas');
  }
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "reserva", "huesped", "habitacion", "tipo_habitacion", "recurso_servicio", "salida_experiencia", "turno", "configuracion_pasarela", "empresa", "correo_enviado", "evento_usuario", "token_recuperacion" CASCADE',
  );
  // Los hoteles de prueba vuelven a sus políticas por defecto y activos; los
  // que crean las pruebas de la consola se borran (con su personal).
  const fijos = `('${HOTELES_PRUEBA.principal.id}', '${HOTELES_PRUEBA.otro.id}')`;
  const correosFijos = Object.values(USUARIOS_PRUEBA)
    .map((u) => `'${u.email}'`)
    .join(', ');
  await prisma.$executeRawUnsafe(`DELETE FROM "usuario" WHERE "email" NOT IN (${correosFijos})`);
  await prisma.$executeRawUnsafe('DELETE FROM "temporada"');
  await prisma.$executeRawUnsafe('DELETE FROM "servicio"');
  await prisma.$executeRawUnsafe('DELETE FROM "definicion_atributo"');
  await prisma.$executeRawUnsafe('DELETE FROM "categoria_servicio"');
  await prisma.$executeRawUnsafe('DELETE FROM "politica_datos"');
  await restaurarRolesDePrueba(prisma);
  await prisma.$executeRawUnsafe(`DELETE FROM "hotel" WHERE "id" NOT IN ${fijos}`);
  // Cada hotel de prueba vuelve al calendario sugerido (fin de año, mitad de año).
  await prisma.temporada.createMany({
    data: Object.values(HOTELES_PRUEBA).flatMap((h) =>
      TEMPORADAS_INICIALES.map((t) => ({ ...t, hotelId: h.id })),
    ),
  });
  for (const hotel of Object.values(HOTELES_PRUEBA)) {
    await prisma.hotel.update({
      where: { id: hotel.id },
      data: {
        ...hotel,
        politicas: {},
        activo: true,
        ciudad: null,
        nit: null,
        telefono: null,
        eslogan: null,
        logo: null,
        colorPrimario: '#0f1b2d',
        colorAcento: '#c9a227',
        fuenteTitulos: 'Playfair Display',
        fuenteTexto: 'Inter',
        tipoAlojamiento: 'Hotel',
      },
    });
  }
}

// Crea una habitación de un tipo con la tarifa base indicada (el tipo se crea
// la primera vez y se reutiliza). Capacidad: 2 incluidos, máximo 4.
export async function crearHabitacion(
  prisma: PrismaService,
  datos: { numero?: string; tarifaNoche?: number; hotelId?: string } = {},
) {
  const hotelId = datos.hotelId ?? HOTEL_PRUEBA_ID;
  const tarifaBase = datos.tarifaNoche ?? 80000;
  const codigo = `prueba-${tarifaBase}`;
  const tipo = await prisma.tipoHabitacion
    .upsert({
      where: { hotelId_codigo: { hotelId, codigo } },
      update: {},
      create: {
        hotelId,
        codigo,
        nombre: `Prueba ${tarifaBase}`,
        tarifaBase,
        capacidadIncluida: 2,
        capacidadMaxima: 4,
        cargoPersonaAdicional: 30000,
        cargoNinoAdicional: 15000,
      },
    })
    // Si varias habitaciones se crean en paralelo, otra pudo crear el tipo primero.
    .catch(() =>
      prisma.tipoHabitacion.findUniqueOrThrow({ where: { hotelId_codigo: { hotelId, codigo } } }),
    );
  return prisma.habitacion.create({
    data: { hotelId, numero: datos.numero ?? '101', tipoHabitacionId: tipo.id },
  });
}

// Cuerpo válido para POST /reservas; las pruebas solo cambian lo que les importa.
// El huésped se registra con pasaporte (exento de IVA) para que el total de
// estas pruebas sea solo noches × tarifa; el IVA se prueba en tarifas.e2e-spec.
export function cuerpoReserva(habitacionId: string, fechaEntrada: string, fechaSalida: string) {
  return {
    habitacionId,
    huesped: { nombre: 'Huésped de prueba', tipoDocumento: 'PASAPORTE', documento: '123' },
    fechaEntrada,
    fechaSalida,
  };
}

// Ocupante válido para el check-in (R43): por defecto, el titular de
// cuerpoReserva, adulto, con todos los datos legales y la política aceptada.
// Las pruebas solo cambian lo que les importa.
export function ocupanteDePrueba(cambios: Record<string, unknown> = {}) {
  return {
    titular: true,
    tipoDocumento: 'PASAPORTE',
    documento: '123',
    primerNombre: 'Huésped',
    primerApellido: 'de prueba',
    fechaNacimiento: '1990-05-20',
    nacionalidad: 'CO',
    paisResidencia: 'CO',
    ciudadResidencia: 'Bogotá',
    paisProcedencia: 'CO',
    ciudadProcedencia: 'Bogotá',
    aceptaPoliticaDatos: true,
    ...cambios,
  };
}

// Cuerpo válido para POST /reservas/:id/check-in.
export function cuerpoCheckIn(ocupantes: object[] = [ocupanteDePrueba()], motivoViaje = 'turismo') {
  return { motivoViaje, ocupantes };
}

// Plan 18: la bandeja del correo simulado (lo que "se envió").
export const bandejaDeCorreo = () => CorreoSimulado.bandeja();
export const vaciarBandeja = () => {
  CorreoSimulado.vaciar();
  CorreoSimulado.fallar = false;
};

// La contraseña temporal del último correo de credenciales a ese correo.
export function temporalDe(email: string) {
  const correo = [...bandejaDeCorreo()].reverse().find((c) => c.para === email);
  const temporal = correo?.texto.match(/Contraseña temporal: (\S+)/)?.[1];
  if (!temporal) throw new Error(`No llegó un correo con la contraseña temporal a ${email}`);
  return temporal;
}

// Plan 19: el rol de un hotel por su nombre (p. ej. "Recepción").
export async function rolDelHotel(prisma: PrismaService, hotelId: string, nombre: string) {
  return prisma.rolHotel.findFirstOrThrow({ where: { hotelId, nombre } });
}

// Plan 19: los hoteles de prueba vuelven a tener solo los roles de las
// plantillas, con sus permisos, y los usuarios fijos su rol sin ajustes.
async function restaurarRolesDePrueba(prisma: PrismaService) {
  await prisma.eventoRol.deleteMany();
  const hoteles = Object.values(HOTELES_PRUEBA).map((h) => h.id);
  const idDe = new Map<string, string>();
  // 1. Cada plantilla existe (si una prueba la borró, se recrea con un nombre provisional).
  for (const hotelId of hoteles) {
    for (const nombre of Object.keys(PLANTILLAS_DE_ROL)) {
      const rol =
        (await prisma.rolHotel.findFirst({ where: { hotelId, plantilla: nombre } })) ??
        (await prisma.rolHotel.create({
          data: { hotelId, nombre: `__${nombre}`, permisos: [], plantilla: nombre },
        }));
      idDe.set(`${hotelId}:${nombre}`, rol.id);
    }
  }
  // 2. Los usuarios fijos vuelven a su rol, sin ajustes.
  for (const u of Object.values(USUARIOS_PRUEBA)) {
    if (!u.plantilla) continue;
    await prisma.usuario.updateMany({
      where: { email: u.email },
      data: {
        hotelId: u.hotelId,
        rolId: idDe.get(`${u.hotelId}:${u.plantilla}`),
        permisosAgregados: [],
        permisosQuitados: [],
      },
    });
  }
  // 3. Se borran los roles que crearon las pruebas y las plantillas recuperan su forma.
  await prisma.rolHotel.deleteMany({ where: { hotelId: { in: hoteles }, plantilla: null } });
  for (const [clave, id] of idDe) {
    const nombre = clave.split(':')[1] as keyof typeof PLANTILLAS_DE_ROL;
    await prisma.rolHotel.update({
      where: { id },
      data: {
        nombre,
        descripcion: PLANTILLAS_DE_ROL[nombre].descripcion,
        permisos: [...PLANTILLAS_DE_ROL[nombre].permisos],
      },
    });
  }
}

// Plan 19: una persona del hotel con un rol (y sus ajustes), y su sesión.
export async function personaConRol(
  app: INestApplication,
  prisma: PrismaService,
  datos: {
    email: string;
    rolId: string;
    hotelId?: string;
    permisosAgregados?: string[];
    permisosQuitados?: string[];
  },
) {
  const usuario = await prisma.usuario.create({
    data: {
      nombre: datos.email.split('@')[0],
      email: datos.email,
      hotelId: datos.hotelId ?? HOTEL_PRUEBA_ID,
      tipo: 'hotel',
      rolId: datos.rolId,
      permisosAgregados: datos.permisosAgregados ?? [],
      permisosQuitados: datos.permisosQuitados ?? [],
      contrasenaHash: await cifrarContrasena(CONTRASENA_PRUEBA),
    },
  });
  const token = await app.get(JwtService).signAsync({ sub: usuario.id, ver: 0 });
  return {
    usuario,
    sesion: request.agent(app.getHttpServer()).set('Authorization', `Bearer ${token}`),
  };
}
