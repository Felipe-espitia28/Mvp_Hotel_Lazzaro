import {
  CategoriaCargo,
  EstadoReserva,
  MedioPago,
  MotivoViaje,
  Prisma,
  PrismaClient,
  TipoEventoReserva,
} from '@prisma/client';

const pesos = (valor: number) => `$${valor.toLocaleString('es-CO')}`;
import { fechaDelHotel, instanteDelHotel, sumarDias } from '../src/hotel/politicas';
import { cifrarContrasena } from '../src/auth/contrasenas';
import { cotizar, valorPrimeraNoche } from '../src/tarifas/motor-tarificacion';
import { condicionesDe } from '../src/tarifas/tarifas.service';

try {
  process.loadEnvFile();
} catch {
  // Sin .env: se usan las variables del entorno.
}

// Carga datos de ejemplo para la demo. Es repetible y no destructivo: las
// reservas de demo tienen IDs fijos y cada ejecución las vuelve a dejar en su
// escenario con fechas relativas a HOY; los demás datos no se tocan.
const prisma = new PrismaClient();

// Tipos de habitación (R12): tarifa base en temporada baja, capacidades y cargo por persona adicional.
const tipos = [
  {
    codigo: 'sencilla',
    nombre: 'Sencilla',
    tarifaBase: 80000,
    capacidadIncluida: 1,
    capacidadMaxima: 2,
    cargoPersonaAdicional: 35000,
  },
  {
    codigo: 'doble',
    nombre: 'Doble',
    tarifaBase: 130000,
    capacidadIncluida: 2,
    capacidadMaxima: 3,
    cargoPersonaAdicional: 40000,
  },
  {
    codigo: 'suite',
    nombre: 'Suite',
    tarifaBase: 220000,
    capacidadIncluida: 2,
    capacidadMaxima: 4,
    cargoPersonaAdicional: 50000,
  },
];

const habitaciones = [
  { numero: '101', tipo: 'sencilla' },
  { numero: '102', tipo: 'sencilla' },
  { numero: '201', tipo: 'doble' },
  { numero: '202', tipo: 'doble' },
  { numero: '301', tipo: 'suite' },
  { numero: '302', tipo: 'suite' },
];

interface EscenarioDemo {
  id: string;
  habitacion: string;
  huesped: { nombre: string; documento: string; telefono?: string };
  desdeHoy: number; // días desde hoy hasta la entrada
  huespedes?: number; // 1 por defecto
  noches: number;
  estado: EstadoReserva;
  total?: 'alojamiento' | 'una-noche' | 'cero';
  // Consumos del folio (R20–R23); en una estadía cerrada se suman a su total.
  consumos?: {
    categoria: CategoriaCargo;
    concepto: string;
    cantidad: number;
    valorUnitario: number;
  }[];
  medioPago?: MedioPago;
  // R19: datos del registro hotelero (solo si ya hizo check-in).
  registro?: { nacionalidad: string; procedencia: string; motivoViaje: MotivoViaje };
  nota: string;
}

// Un escenario por regla que conviene mostrar en la demo.
const escenarios: EscenarioDemo[] = [
  {
    id: 'demo-reserva-01',
    habitacion: '101',
    huesped: { nombre: 'Carlos Gómez', documento: '1020304050', telefono: '3001234567' },
    desdeHoy: -2,
    noches: 2, // sale hoy: check-out normal (antes de esa fecha sería salida anticipada, R24)
    estado: 'activa',
    registro: { nacionalidad: 'CO', procedencia: 'Bogotá', motivoViaje: 'negocios' },
    consumos: [
      { categoria: 'minibar', concepto: 'Agua 600 ml', cantidad: 2, valorUnitario: 6000 },
      { categoria: 'lavanderia', concepto: 'Lavado de camisas', cantidad: 1, valorUnitario: 25000 },
      {
        categoria: 'restaurante',
        concepto: 'Cena en el restaurante',
        cantidad: 1,
        valorUnitario: 68000,
      },
    ],
    nota: 'Huésped alojado con consumos en su folio: lista para check-out',
  },
  {
    id: 'demo-reserva-02',
    habitacion: '201',
    huesped: { nombre: 'Ana Martínez', documento: '52123456' },
    desdeHoy: 0,
    huespedes: 3, // una persona adicional en la doble
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
    consumos: [
      {
        categoria: 'restaurante',
        concepto: 'Desayuno a la habitación',
        cantidad: 2,
        valorUnitario: 22000,
      },
    ],
    medioPago: 'tarjeta',
    registro: { nacionalidad: 'CO', procedencia: 'Medellín', motivoViaje: 'turismo' },
    nota: 'Estadía terminada y liquidada (alojamiento + consumos)',
  },
  {
    id: 'demo-reserva-07',
    habitacion: '302',
    huesped: { nombre: 'Jorge Peña', documento: '91222333' },
    // Llegaba mañana: al cancelar hoy faltaban menos de 48 h → penalidad (R9).
    desdeHoy: 1,
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

// Historial de auditoría coherente con el estado de cada reserva de demo, con
// horas creíbles (creada antes de llegar, check-in en la tarde, check-out en la mañana).
async function registrarHistorial(
  e: EscenarioDemo,
  f: {
    fechaEntrada: Date;
    fechaSalida: Date;
    hoy: Date;
    total: Prisma.Decimal | number | null;
    consumos: number;
  },
  usuarioId: string | null,
) {
  if (!usuarioId) return;
  const diaCreacion = sumarDias(f.hoy, Math.min(e.desdeHoy - 3, -1));
  const eventos: { tipo: TipoEventoReserva; fecha: Date; detalle?: string }[] = [
    { tipo: 'creada', fecha: instanteDelHotel(diaCreacion, 10) },
  ];
  if (e.estado === 'activa' || e.estado === 'cerrada') {
    eventos.push({ tipo: 'check_in', fecha: instanteDelHotel(f.fechaEntrada, 15.5) });
  }
  for (const c of e.consumos ?? []) {
    eventos.push({
      tipo: 'cargo_agregado',
      fecha: instanteDelHotel(f.fechaEntrada, 20),
      detalle: `${c.concepto} × ${c.cantidad} · ${pesos(c.cantidad * c.valorUnitario)}`,
    });
  }
  if (e.estado === 'cerrada') {
    const total = Number(f.total);
    const liquidacion =
      f.consumos > 0
        ? `Total ${pesos(total)} (alojamiento ${pesos(total - f.consumos)} + consumos ${pesos(f.consumos)})`
        : `Total ${pesos(total)}`;
    eventos.push({
      tipo: 'check_out',
      fecha: instanteDelHotel(f.fechaSalida, 11),
      detalle: e.medioPago ? `${liquidacion} · ${e.medioPago}` : liquidacion,
    });
  }
  if (e.estado === 'cancelada') {
    eventos.push({
      tipo: 'cancelada',
      fecha: instanteDelHotel(f.hoy, 9),
      detalle:
        Number(f.total) > 0 ? `Penalidad $${Number(f.total).toLocaleString('es-CO')}` : 'Sin costo',
    });
  }

  await prisma.eventoReserva.deleteMany({ where: { reservaId: e.id } });
  await prisma.eventoReserva.createMany({
    data: eventos.map((ev) => ({ ...ev, reservaId: e.id, usuarioId })),
  });
}

async function main() {
  await crearUsuariosIniciales();

  // Si el tipo ya existe no se toca: respeta las tarifas que el hotel haya editado.
  for (const tipo of tipos) {
    await prisma.tipoHabitacion.upsert({
      where: { codigo: tipo.codigo },
      update: {},
      create: tipo,
    });
  }

  for (const habitacion of habitaciones) {
    await prisma.habitacion.upsert({
      where: { numero: habitacion.numero },
      update: {},
      create: {
        numero: habitacion.numero,
        tipoHabitacion: { connect: { codigo: habitacion.tipo } },
      },
    });
  }

  // Estados de partida de las habitaciones de demo (R25): todas listas salvo la
  // 202, que se acaba de desocupar y está en limpieza. La 101 queda ocupada más
  // abajo por la estadía activa.
  await prisma.habitacion.updateMany({
    where: { numero: { in: habitaciones.map((h) => h.numero) } },
    data: { estado: 'libre' },
  });
  await prisma.habitacion.update({ where: { numero: '202' }, data: { estado: 'en_limpieza' } });

  // Primero se "apagan" las reservas de demo de una ejecución anterior para que
  // sus fechas viejas no choquen con la restricción de no-sobreventa al moverlas.
  await prisma.reserva.updateMany({
    where: { id: { in: escenarios.map((e) => e.id) } },
    data: { estado: 'cancelada' },
  });

  // Las acciones de la demo las "hizo" recepción (o el admin si no existe).
  const operador =
    (await prisma.usuario.findFirst({ where: { rol: 'recepcionista', activo: true } })) ??
    (await prisma.usuario.findFirst({ where: { rol: 'admin', activo: true } }));
  const idRecepcion = operador?.id ?? null;

  const hoy = fechaDelHotel(new Date());
  for (const e of escenarios) {
    const habitacion = await prisma.habitacion.findUniqueOrThrow({
      where: { numero: e.habitacion },
      include: { tipoHabitacion: true },
    });
    const fechaEntrada = sumarDias(hoy, e.desdeHoy);
    const fechaSalida = sumarDias(fechaEntrada, e.noches);
    // Precio calculado con el mismo motor que usa la API (huéspedes con cédula: con IVA).
    const huespedes = e.huespedes ?? 1;
    const desglose = cotizar(
      condicionesDe(habitacion.tipoHabitacion),
      fechaEntrada,
      fechaSalida,
      huespedes,
      false,
    );
    const valorAlojamiento = desglose.total;
    const consumos = (e.consumos ?? []).reduce((s, c) => s + c.cantidad * c.valorUnitario, 0);
    const total =
      e.total === 'alojamiento'
        ? valorAlojamiento + consumos
        : e.total === 'una-noche'
          ? valorPrimeraNoche(desglose)
          : e.total === 'cero'
            ? 0
            : null;

    // El huésped se identifica por su documento, igual que en la API.
    const { id: huespedId } = await prisma.huesped.upsert({
      where: { tipoDocumento_documento: { tipoDocumento: 'CC', documento: e.huesped.documento } },
      update: e.registro ? { nacionalidad: e.registro.nacionalidad } : {},
      create: { ...e.huesped, nacionalidad: e.registro?.nacionalidad },
    });

    const datos = {
      habitacionId: habitacion.id,
      huespedId,
      fechaEntrada,
      fechaSalida,
      estado: e.estado,
      valorAlojamiento,
      numeroHuespedes: huespedes,
      desglose: desglose as unknown as Prisma.InputJsonObject,
      total,
      medioPago: e.medioPago ?? null,
      procedencia: e.registro?.procedencia ?? null,
      motivoViaje: e.registro?.motivoViaje ?? null,
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

    // Folio: se rehacen los consumos del escenario (cargados la primera noche, 8 p. m.).
    await prisma.cargo.deleteMany({ where: { reservaId: e.id } });
    if (idRecepcion) {
      for (const c of e.consumos ?? []) {
        await prisma.cargo.create({
          data: {
            ...c,
            reservaId: e.id,
            total: c.cantidad * c.valorUnitario,
            usuarioId: idRecepcion,
            fecha: instanteDelHotel(fechaEntrada, 20),
          },
        });
      }
    }

    await registrarHistorial(e, { fechaEntrada, fechaSalida, hoy, total, consumos }, idRecepcion);
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
