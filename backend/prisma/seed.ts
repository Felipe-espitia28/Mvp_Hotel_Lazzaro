import { EstadoReserva, PrismaClient } from '@prisma/client';
import { contarNoches, fechaDelHotel, sumarDias } from '../src/hotel/politicas';
import { cifrarContrasena } from '../src/auth/contrasenas';

try {
  process.loadEnvFile();
} catch {
  // Sin .env: se usan las variables del entorno.
}

// Carga datos de ejemplo para la demo. Es repetible y no destructivo: las
// reservas de demo tienen IDs fijos y cada ejecución las vuelve a dejar en su
// escenario con fechas relativas a HOY; los demás datos no se tocan.
const prisma = new PrismaClient();

const habitaciones = [
  { numero: '101', tipo: 'sencilla', tarifaNoche: 80000 },
  { numero: '102', tipo: 'sencilla', tarifaNoche: 80000 },
  { numero: '201', tipo: 'doble', tarifaNoche: 130000 },
  { numero: '202', tipo: 'doble', tarifaNoche: 130000 },
  { numero: '301', tipo: 'suite', tarifaNoche: 220000 },
  { numero: '302', tipo: 'suite', tarifaNoche: 250000 },
];

interface EscenarioDemo {
  id: string;
  habitacion: string;
  huesped: { nombre: string; documento: string; telefono?: string };
  desdeHoy: number; // días desde hoy hasta la entrada
  noches: number;
  estado: EstadoReserva;
  total?: 'alojamiento' | 'una-noche' | 'cero';
  nota: string;
}

// Un escenario por regla que conviene mostrar en la demo.
const escenarios: EscenarioDemo[] = [
  {
    id: 'demo-reserva-01',
    habitacion: '101',
    huesped: { nombre: 'Carlos Gómez', documento: '1020304050', telefono: '3001234567' },
    desdeHoy: -2,
    noches: 4,
    estado: 'activa',
    nota: 'Huésped alojado: lista para check-out',
  },
  {
    id: 'demo-reserva-02',
    habitacion: '201',
    huesped: { nombre: 'Ana Martínez', documento: '52123456' },
    desdeHoy: 0,
    noches: 3,
    estado: 'confirmada',
    nota: 'Llega hoy: lista para check-in',
  },
  {
    id: 'demo-reserva-03',
    habitacion: '202',
    huesped: { nombre: 'Luis Herrera', documento: '80987654' },
    desdeHoy: 1,
    noches: 3,
    estado: 'confirmada',
    nota: 'Llega mañana: cancelarla cobra 1 noche de penalidad',
  },
  {
    id: 'demo-reserva-04',
    habitacion: '301',
    huesped: { nombre: 'Sofía Ramírez', documento: '1098765432', telefono: '3157654321' },
    desdeHoy: 10,
    noches: 3,
    estado: 'confirmada',
    nota: 'Llega en 10 días: cancelación gratuita',
  },
  {
    id: 'demo-reserva-05',
    habitacion: '102',
    huesped: { nombre: 'Pedro Castillo', documento: '79111222' },
    desdeHoy: -2,
    noches: 4,
    estado: 'confirmada',
    nota: 'Nunca llegó: el sistema la marcará como no-show',
  },
  {
    id: 'demo-reserva-06',
    habitacion: '302',
    huesped: { nombre: 'Valentina Ortiz', documento: '1012345678' },
    desdeHoy: -7,
    noches: 3,
    estado: 'cerrada',
    total: 'alojamiento',
    nota: 'Estadía terminada y liquidada',
  },
  {
    id: 'demo-reserva-07',
    habitacion: '302',
    huesped: { nombre: 'Jorge Peña', documento: '91222333' },
    desdeHoy: 3,
    noches: 2,
    estado: 'cancelada',
    total: 'una-noche',
    nota: 'Cancelación tardía con penalidad',
  },
];

// Usuarios iniciales: sin ellos nadie podría entrar al sistema. Las credenciales
// vienen del .env; si el usuario ya existe no se toca (respeta cambios de contraseña).
async function crearUsuariosIniciales() {
  const iniciales = [
    {
      nombre: 'Administrador',
      rol: 'admin',
      email: process.env.ADMIN_EMAIL,
      contrasena: process.env.ADMIN_PASSWORD,
    },
    {
      nombre: 'Recepción',
      rol: 'recepcionista',
      email: process.env.RECEPCION_EMAIL,
      contrasena: process.env.RECEPCION_PASSWORD,
    },
  ] as const;

  for (const u of iniciales) {
    if (!u.email || !u.contrasena) {
      console.warn(`  ✗ Usuario ${u.rol} omitido: faltan sus variables en el .env`);
      continue;
    }
    const email = u.email.trim().toLowerCase();
    const existente = await prisma.usuario.findUnique({ where: { email } });
    if (!existente) {
      await prisma.usuario.create({
        data: {
          nombre: u.nombre,
          email,
          rol: u.rol,
          contrasenaHash: await cifrarContrasena(u.contrasena),
        },
      });
    }
    console.log(`  ✓ Usuario ${u.rol}: ${email}${existente ? ' (ya existía)' : ''}`);
  }
}

async function main() {
  await crearUsuariosIniciales();

  for (const habitacion of habitaciones) {
    await prisma.habitacion.upsert({
      where: { numero: habitacion.numero },
      update: {},
      create: habitacion,
    });
  }

  // Primero se "apagan" las reservas de demo de una ejecución anterior para que
  // sus fechas viejas no choquen con la restricción de no-sobreventa al moverlas.
  await prisma.reserva.updateMany({
    where: { id: { in: escenarios.map((e) => e.id) } },
    data: { estado: 'cancelada' },
  });

  const hoy = fechaDelHotel(new Date());
  for (const e of escenarios) {
    const habitacion = await prisma.habitacion.findUniqueOrThrow({
      where: { numero: e.habitacion },
    });
    const fechaEntrada = sumarDias(hoy, e.desdeHoy);
    const fechaSalida = sumarDias(fechaEntrada, e.noches);
    const valorAlojamiento = habitacion.tarifaNoche.mul(contarNoches(fechaEntrada, fechaSalida));
    const total =
      e.total === 'alojamiento'
        ? valorAlojamiento
        : e.total === 'una-noche'
          ? habitacion.tarifaNoche
          : e.total === 'cero'
            ? 0
            : null;

    const huespedId = `${e.id}-huesped`;
    await prisma.huesped.upsert({
      where: { id: huespedId },
      update: e.huesped,
      create: { id: huespedId, ...e.huesped },
    });

    const datos = {
      habitacionId: habitacion.id,
      huespedId,
      fechaEntrada,
      fechaSalida,
      estado: e.estado,
      valorAlojamiento,
      total,
    };
    try {
      await prisma.reserva.upsert({
        where: { id: e.id },
        update: datos,
        create: { id: e.id, ...datos },
      });
      console.log(`  ✓ ${e.habitacion} · ${e.huesped.nombre} — ${e.nota}`);
    } catch {
      // La habitación ya tiene una reserva real en esas fechas: se respeta.
      console.warn(`  ✗ ${e.habitacion} · ${e.huesped.nombre} — omitida (choca con otra reserva)`);
      continue;
    }

    if (e.estado === 'activa') {
      await prisma.habitacion.update({
        where: { id: habitacion.id },
        data: { estado: 'ocupada' },
      });
    }
  }

  console.log(
    `Seed completado: ${habitaciones.length} habitaciones y ${escenarios.length} reservas de demo.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
