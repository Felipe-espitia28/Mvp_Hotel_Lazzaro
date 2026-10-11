import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configurarApp } from '../src/configurar-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { Reloj } from '../src/hotel/reloj';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { cifrarContrasena } from '../src/auth/contrasenas';

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
  const comoAdmin = await clienteCon(app, prisma, USUARIOS_PRUEBA.admin);
  const comoRecepcionista = await clienteCon(app, prisma, USUARIOS_PRUEBA.recepcionista);

  // http(): cliente con sesión de administrador (puede hacer todo), para las
  // pruebas que no tratan sobre permisos.
  return { app, prisma, reloj, http: () => comoAdmin, comoRecepcionista };
}

// Usuarios fijos de las pruebas. limpiarBD no borra la tabla de usuarios.
export const USUARIOS_PRUEBA = {
  admin: { email: 'admin@prueba.test', nombre: 'Admin Prueba', rol: 'admin' },
  recepcionista: {
    email: 'recepcion@prueba.test',
    nombre: 'Recepción Prueba',
    rol: 'recepcionista',
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
  const usuario = await prisma.usuario.upsert({
    where: { email: datos.email },
    update: { activo: true, rol: datos.rol, contrasenaHash },
    create: { ...datos, contrasenaHash },
  });
  const token = await app.get(JwtService).signAsync({ sub: usuario.id });
  return request.agent(app.getHttpServer()).set('Authorization', `Bearer ${token}`);
}

// Prepara cada prueba: base vacía y reloj en la hora por defecto.
export async function reiniciar(prisma: PrismaService, reloj: RelojFalso) {
  reloj.fijar(AHORA_POR_DEFECTO);
  await limpiarBD(prisma);
}

// Vacía todas las tablas entre pruebas. Se niega a correr si la URL no es la
// de la base de pruebas, para no borrar datos de desarrollo por accidente.
export async function limpiarBD(prisma: PrismaService) {
  if (!process.env.DATABASE_URL?.includes('_test')) {
    throw new Error('limpiarBD solo puede ejecutarse sobre una base de pruebas');
  }
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "reserva", "huesped", "habitacion", "tipo_habitacion" CASCADE',
  );
}

// Crea una habitación de un tipo con la tarifa base indicada (el tipo se crea
// la primera vez y se reutiliza). Capacidad: 2 incluidos, máximo 4.
export async function crearHabitacion(
  prisma: PrismaService,
  datos: { numero?: string; tarifaNoche?: number } = {},
) {
  const tarifaBase = datos.tarifaNoche ?? 80000;
  const codigo = `prueba-${tarifaBase}`;
  const tipo = await prisma.tipoHabitacion
    .upsert({
      where: { codigo },
      update: {},
      create: {
        codigo,
        nombre: `Prueba ${tarifaBase}`,
        tarifaBase,
        capacidadIncluida: 2,
        capacidadMaxima: 4,
        cargoPersonaAdicional: 30000,
      },
    })
    // Si varias habitaciones se crean en paralelo, otra pudo crear el tipo primero.
    .catch(() => prisma.tipoHabitacion.findUniqueOrThrow({ where: { codigo } }));
  return prisma.habitacion.create({
    data: { numero: datos.numero ?? '101', tipoHabitacionId: tipo.id },
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
