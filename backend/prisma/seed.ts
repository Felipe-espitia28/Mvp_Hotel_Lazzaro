import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CategoriaCargo,
  EstadoReserva,
  MedioPago,
  MotivoViaje,
  Prisma,
  PrismaClient,
  TipoEventoReserva,
} from '@prisma/client';
import {
  fechaDelHotel,
  instanteDelHotel,
  limiteCancelacionGratuita,
  sumarDias,
} from '../src/hotel/politicas';
import { cifrarContrasena } from '../src/auth/contrasenas';
import {
  PRODUCTOS_INICIALES,
  TEMPORADAS_INICIALES,
  TIPOS_INICIALES,
} from '../src/hotel/datos-iniciales';
import { SELECCION_CONTEXTO, contextoDeHotel } from '../src/hotel/contexto';
import { cotizar, recortarDesglose } from '../src/tarifas/motor-tarificacion';
import { condicionesDe, reglasDeTarifa } from '../src/tarifas/tarifas.service';

try {
  process.loadEnvFile();
} catch {
  // Sin .env: se usan las variables del entorno.
}

// Carga los datos de la demo: dos hoteles con identidades distintas (para
// mostrar que la plataforma es multi-hotel) y el usuario del equipo de Lazaro.
// Es repetible y no destructivo: las reservas de demo tienen IDs fijos y cada
// ejecución las vuelve a dejar en su escenario con fechas relativas a HOY; los
// demás datos (otras reservas, cambios del hotel en su catálogo, temporadas o
// tarifas) no se tocan. La marca y las políticas de los hoteles de demo sí
// vuelven a las de la demo.
const prisma = new PrismaClient();

const pesos = (valor: number) => `$${valor.toLocaleString('es-CO')}`;

interface EscenarioDemo {
  id: string;
  habitacion: string;
  huesped: { nombre: string; documento: string; telefono?: string };
  desdeHoy: number; // días desde hoy hasta la entrada
  huespedes?: number; // 1 por defecto
  noches: number;
  estado: EstadoReserva;
  // Cerrada: alojamiento + consumos. Penalidad: las noches de penalidad del hotel.
  total?: 'alojamiento' | 'penalidad' | 'cero';
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

interface HotelDemo {
  // El de Hotel Andino es el mismo que la migración multi-tenant le dio a los
  // datos que ya existían; los demás se buscan por su identificador (slug).
  id?: string;
  slug: string;
  nombre: string;
  ciudad: string;
  nit: string;
  telefono: string;
  eslogan: string;
  colorPrimario: string;
  colorAcento: string;
  fuenteTitulos: string;
  fuenteTexto: string;
  logo: string; // archivo en prisma/logos/
  politicas: Prisma.InputJsonObject;
  // Temporadas propias además del calendario sugerido (se crean si faltan).
  temporadas: { nombre: string; tipo: 'alta' | 'media'; desde: number; hasta: number }[];
  // Precio base por tipo de habitación (el resto de condiciones es el sugerido).
  tarifas: Record<string, number>;
  habitaciones: { numero: string; tipo: string }[];
  enLimpieza: string[];
  usuarios: { nombre: string; rol: 'admin' | 'recepcionista'; variable: string }[];
  escenarios: EscenarioDemo[];
}

// Hotel Andino (Bogotá): marca clásica, políticas por defecto. Sus escenarios
// cubren las reglas que se muestran en la demo.
const ANDINO: HotelDemo = {
  id: '00000000-0000-4000-8000-000000000001',
  slug: 'hotel-andino',
  nombre: 'Hotel Andino',
  ciudad: 'Bogotá',
  nit: '900.123.456-7',
  telefono: '601 555 0101',
  eslogan: 'Tradición y descanso en Bogotá',
  colorPrimario: '#12305c',
  colorAcento: '#2563eb',
  fuenteTitulos: 'Arial',
  fuenteTexto: 'Arial',
  logo: 'hotel-andino.png',
  politicas: {},
  temporadas: [],
  tarifas: { sencilla: 80000, doble: 130000, suite: 220000 },
  habitaciones: [
    { numero: '101', tipo: 'sencilla' },
    { numero: '102', tipo: 'sencilla' },
    { numero: '201', tipo: 'doble' },
    { numero: '202', tipo: 'doble' },
    { numero: '301', tipo: 'suite' },
    { numero: '302', tipo: 'suite' },
  ],
  enLimpieza: ['202'],
  usuarios: [
    { nombre: 'Gerencia Andino', rol: 'admin', variable: 'ADMIN' },
    { nombre: 'Recepción Andino', rol: 'recepcionista', variable: 'RECEPCION' },
  ],
  escenarios: [
    {
      id: 'demo-reserva-01',
      habitacion: '101',
      huesped: { nombre: 'Carlos Gómez', documento: '1020304050', telefono: '3001234567' },
      desdeHoy: -2,
      noches: 2, // sale hoy: check-out normal (antes sería salida anticipada, R24)
      estado: 'activa',
      registro: { nacionalidad: 'CO', procedencia: 'Bogotá', motivoViaje: 'negocios' },
      consumos: [
        { categoria: 'minibar', concepto: 'Agua 600 ml', cantidad: 2, valorUnitario: 6000 },
        {
          categoria: 'lavanderia',
          concepto: 'Lavado de camisas',
          cantidad: 1,
          valorUnitario: 25000,
        },
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
      total: 'penalidad',
      nota: 'Cancelación tardía con penalidad',
    },
  ],
};

// Sol Caribe (Cartagena): otra marca, otras reglas (cancelación más estricta,
// temporadas propias y multiplicadores más altos) y otros precios.
const SOL_CARIBE: HotelDemo = {
  slug: 'sol-caribe',
  nombre: 'Sol Caribe',
  ciudad: 'Cartagena',
  nit: '900.555.123-4',
  telefono: '605 555 0202',
  eslogan: 'Frente al mar de Cartagena',
  colorPrimario: '#2c5a63',
  colorAcento: '#d4915d',
  fuenteTitulos: 'Arial',
  fuenteTexto: 'Arial',
  logo: 'sol-caribe.png',
  politicas: {
    horasCancelacionGratuita: 24,
    nochesPenalidad: 2,
    horaCheckIn: 14,
    horaCheckOut: 11,
    multiplicadorTemporada: { baja: 1, media: 1.2, alta: 1.5 },
  },
  temporadas: [
    { nombre: 'Temporada de playa', tipo: 'alta', desde: 610, hasta: 731 },
    { nombre: 'Fiestas de Independencia', tipo: 'media', desde: 1106, hasta: 1115 },
  ],
  tarifas: { sencilla: 150000, doble: 210000, suite: 380000 },
  habitaciones: [
    { numero: '11', tipo: 'sencilla' },
    { numero: '12', tipo: 'doble' },
    { numero: '21', tipo: 'doble' },
    { numero: '22', tipo: 'doble' },
    { numero: '31', tipo: 'suite' },
  ],
  enLimpieza: ['12'],
  usuarios: [
    { nombre: 'Gerencia Sol Caribe', rol: 'admin', variable: 'SOL_ADMIN' },
    { nombre: 'Recepción Sol Caribe', rol: 'recepcionista', variable: 'SOL_RECEPCION' },
  ],
  escenarios: [
    {
      id: 'demo-sol-01',
      habitacion: '21',
      huesped: { nombre: 'Emily Johnson', documento: 'A12345678' },
      desdeHoy: -1,
      huespedes: 2,
      noches: 3,
      estado: 'activa',
      registro: { nacionalidad: 'US', procedencia: 'Miami', motivoViaje: 'turismo' },
      consumos: [
        { categoria: 'minibar', concepto: 'Cerveza nacional', cantidad: 4, valorUnitario: 9000 },
        {
          categoria: 'restaurante',
          concepto: 'Cena frente al mar',
          cantidad: 1,
          valorUnitario: 145000,
        },
      ],
      nota: 'Turista extranjera alojada (se reporta a Migración), con consumos',
    },
    {
      id: 'demo-sol-02',
      habitacion: '31',
      huesped: { nombre: 'Familia Rodríguez', documento: '1045678901', telefono: '3209876543' },
      desdeHoy: 0,
      huespedes: 4,
      noches: 4,
      estado: 'confirmada',
      nota: 'Familia que llega hoy a la suite: lista para check-in',
    },
    {
      id: 'demo-sol-03',
      habitacion: '22',
      huesped: { nombre: 'Julián Torres', documento: '1122334455' },
      desdeHoy: 5,
      noches: 2,
      estado: 'confirmada',
      nota: 'Llega en 5 días: aún cancela gratis (el hotel da 24 h)',
    },
    {
      id: 'demo-sol-04',
      habitacion: '11',
      huesped: { nombre: 'Laura Gómez', documento: '43987654' },
      desdeHoy: -6,
      noches: 2,
      estado: 'cerrada',
      total: 'alojamiento',
      consumos: [
        { categoria: 'minibar', concepto: 'Agua 600 ml', cantidad: 3, valorUnitario: 8000 },
      ],
      medioPago: 'transferencia',
      registro: { nacionalidad: 'CO', procedencia: 'Bogotá', motivoViaje: 'turismo' },
      nota: 'Estadía terminada y pagada por transferencia',
    },
  ],
};

// Usuario del equipo de Lazaro (Consola Lazaro): no pertenece a ningún hotel.
async function crearUsuarioPlataforma() {
  const email = process.env.PLATAFORMA_EMAIL?.trim().toLowerCase();
  const contrasena = process.env.PLATAFORMA_PASSWORD;
  if (!email || !contrasena) {
    console.warn('  ✗ Usuario plataforma omitido: faltan sus variables en el .env');
    return;
  }
  const existente = await prisma.usuario.findUnique({ where: { email } });
  if (!existente) {
    await prisma.usuario.create({
      data: {
        nombre: 'Equipo Lazaro',
        email,
        rol: 'plataforma',
        contrasenaHash: await cifrarContrasena(contrasena),
      },
    });
  }
  console.log(`  ✓ Consola Lazaro: ${email}${existente ? ' (ya existía)' : ''}`);
}

// Personas del hotel: las credenciales vienen del .env (<VARIABLE>_EMAIL y
// <VARIABLE>_PASSWORD). Si el usuario ya existe no se toca (respeta cambios de
// contraseña), salvo que se asegura de que pertenezca a este hotel.
async function crearUsuarios(hotelId: string, usuarios: HotelDemo['usuarios']) {
  for (const u of usuarios) {
    const email = process.env[`${u.variable}_EMAIL`]?.trim().toLowerCase();
    const contrasena = process.env[`${u.variable}_PASSWORD`];
    if (!email || !contrasena) {
      console.warn(`  ✗ ${u.nombre} omitido: faltan ${u.variable}_EMAIL / _PASSWORD en el .env`);
      continue;
    }
    const existente = await prisma.usuario.findUnique({ where: { email } });
    if (existente) {
      await prisma.usuario.update({ where: { email }, data: { hotelId } });
    } else {
      await prisma.usuario.create({
        data: {
          hotelId,
          nombre: u.nombre,
          email,
          rol: u.rol,
          contrasenaHash: await cifrarContrasena(contrasena),
        },
      });
    }
    console.log(`  ✓ ${u.nombre}: ${email}${existente ? ' (ya existía)' : ''}`);
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
      detalle: Number(f.total) > 0 ? `Penalidad ${pesos(Number(f.total))}` : 'Sin costo',
    });
  }

  await prisma.eventoReserva.deleteMany({ where: { reservaId: e.id } });
  await prisma.eventoReserva.createMany({
    data: eventos.map((ev) => ({ ...ev, reservaId: e.id, usuarioId })),
  });
}

// Los logos están junto a este archivo (prisma/logos). Compilado (Docker:
// dist/prisma/seed.js) se buscan desde la raíz del backend.
const CARPETA_LOGOS =
  [join(__dirname, 'logos'), join(process.cwd(), 'prisma', 'logos')].find((ruta) =>
    existsSync(ruta),
  ) ?? join(__dirname, 'logos');

const logoDe = (archivo: string) =>
  `data:image/png;base64,${readFileSync(join(CARPETA_LOGOS, archivo)).toString('base64')}`;

async function sembrarHotel(h: HotelDemo) {
  console.log(`\n${h.nombre} (${h.ciudad})`);

  // Marca, datos y políticas de la demo.
  const datosHotel = {
    slug: h.slug,
    nombre: h.nombre,
    ciudad: h.ciudad,
    nit: h.nit,
    telefono: h.telefono,
    eslogan: h.eslogan,
    colorPrimario: h.colorPrimario,
    colorAcento: h.colorAcento,
    fuenteTitulos: h.fuenteTitulos,
    fuenteTexto: h.fuenteTexto,
    logo: logoDe(h.logo),
    politicas: h.politicas,
    activo: true,
  };
  const { id: hotelId } = await prisma.hotel.upsert({
    where: h.id ? { id: h.id } : { slug: h.slug },
    update: datosHotel,
    create: { ...(h.id && { id: h.id }), ...datosHotel },
  });

  await crearUsuarios(hotelId, h.usuarios);

  // Calendario sugerido si el hotel no tiene ninguno, y las temporadas propias
  // de la demo si faltan (se respetan las que el hotel haya creado o editado).
  if ((await prisma.temporada.count({ where: { hotelId } })) === 0) {
    await prisma.temporada.createMany({
      data: TEMPORADAS_INICIALES.map((t) => ({ ...t, hotelId })),
    });
  }
  for (const t of h.temporadas) {
    const existe = await prisma.temporada.findFirst({ where: { hotelId, nombre: t.nombre } });
    if (!existe) await prisma.temporada.create({ data: { ...t, hotelId } });
  }

  // Catálogo de consumos de partida, si el hotel aún no tiene uno.
  if ((await prisma.productoConsumo.count({ where: { hotelId } })) === 0) {
    await prisma.productoConsumo.createMany({
      data: PRODUCTOS_INICIALES.map((p) => ({ ...p, hotelId })),
    });
  }

  // Tipos de habitación: si ya existe no se toca (respeta las tarifas editadas).
  for (const tipo of TIPOS_INICIALES) {
    await prisma.tipoHabitacion.upsert({
      where: { hotelId_codigo: { hotelId, codigo: tipo.codigo } },
      update: {},
      create: { ...tipo, tarifaBase: h.tarifas[tipo.codigo] ?? tipo.tarifaBase, hotelId },
    });
  }
  for (const habitacion of h.habitaciones) {
    const tipo = await prisma.tipoHabitacion.findUniqueOrThrow({
      where: { hotelId_codigo: { hotelId, codigo: habitacion.tipo } },
    });
    await prisma.habitacion.upsert({
      where: { hotelId_numero: { hotelId, numero: habitacion.numero } },
      update: {},
      create: { hotelId, numero: habitacion.numero, tipoHabitacionId: tipo.id },
    });
  }

  // Estados de partida (R25): todas listas salvo las que están en limpieza; las
  // de estadías activas quedan ocupadas más abajo.
  await prisma.habitacion.updateMany({
    where: { hotelId, numero: { in: h.habitaciones.map((x) => x.numero) } },
    data: { estado: 'libre' },
  });
  await prisma.habitacion.updateMany({
    where: { hotelId, numero: { in: h.enLimpieza } },
    data: { estado: 'en_limpieza' },
  });

  // Primero se "apagan" las reservas de demo de una ejecución anterior para que
  // sus fechas viejas no choquen con la restricción de no-sobreventa al moverlas.
  await prisma.reserva.updateMany({
    where: { id: { in: h.escenarios.map((e) => e.id) } },
    data: { estado: 'cancelada' },
  });

  // Reglas del hotel (temporadas, multiplicadores, IVA), igual que en la API.
  const contexto = contextoDeHotel(
    await prisma.hotel.findUniqueOrThrow({ where: { id: hotelId }, select: SELECCION_CONTEXTO }),
  );
  const { politicas } = contexto;

  // Las acciones de la demo las "hizo" recepción (o el administrador).
  const operador =
    (await prisma.usuario.findFirst({ where: { hotelId, rol: 'recepcionista', activo: true } })) ??
    (await prisma.usuario.findFirst({ where: { hotelId, rol: 'admin', activo: true } }));
  const idOperador = operador?.id ?? null;

  const hoy = fechaDelHotel(new Date());
  for (const e of h.escenarios) {
    const habitacion = await prisma.habitacion.findUniqueOrThrow({
      where: { hotelId_numero: { hotelId, numero: e.habitacion } },
      include: { tipoHabitacion: true },
    });
    const fechaEntrada = sumarDias(hoy, e.desdeHoy);
    const fechaSalida = sumarDias(fechaEntrada, e.noches);
    const huespedes = e.huespedes ?? 1;
    // Precio calculado con el mismo motor que usa la API (con IVA).
    const desglose = cotizar(
      condicionesDe(habitacion.tipoHabitacion),
      fechaEntrada,
      fechaSalida,
      huespedes,
      false,
      reglasDeTarifa(contexto),
    );
    const valorAlojamiento = desglose.total;
    const consumos = (e.consumos ?? []).reduce((s, c) => s + c.cantidad * c.valorUnitario, 0);
    const total =
      e.total === 'alojamiento'
        ? valorAlojamiento + consumos
        : e.total === 'penalidad'
          ? recortarDesglose(desglose, Math.min(politicas.nochesPenalidad, e.noches)).total
          : e.total === 'cero'
            ? 0
            : null;

    // El huésped se identifica por su documento dentro del hotel, igual que en la API.
    const tipoDocumento = /^[A-Z]/.test(e.huesped.documento) ? 'PASAPORTE' : 'CC';
    const { id: huespedId } = await prisma.huesped.upsert({
      where: {
        hotelId_tipoDocumento_documento: {
          hotelId,
          tipoDocumento,
          documento: e.huesped.documento,
        },
      },
      update: e.registro ? { nacionalidad: e.registro.nacionalidad } : {},
      create: { ...e.huesped, tipoDocumento, hotelId, nacionalidad: e.registro?.nacionalidad },
    });

    const datos = {
      hotelId,
      habitacionId: habitacion.id,
      huespedId,
      fechaEntrada,
      fechaSalida,
      estado: e.estado,
      valorAlojamiento,
      numeroHuespedes: huespedes,
      desglose: desglose as unknown as Prisma.InputJsonObject,
      // R5/R9: la política de cancelación del hotel queda pactada.
      cancelacionGratuitaHasta: limiteCancelacionGratuita(fechaEntrada, politicas),
      nochesPenalidad: politicas.nochesPenalidad,
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
      await prisma.habitacion.update({ where: { id: habitacion.id }, data: { estado: 'ocupada' } });
    }

    // Folio: se rehacen los consumos del escenario (cargados la primera noche, 8 p. m.).
    await prisma.cargo.deleteMany({ where: { reservaId: e.id } });
    if (idOperador) {
      for (const c of e.consumos ?? []) {
        await prisma.cargo.create({
          data: {
            ...c,
            reservaId: e.id,
            total: c.cantidad * c.valorUnitario,
            usuarioId: idOperador,
            fecha: instanteDelHotel(fechaEntrada, 20),
          },
        });
      }
    }

    await registrarHistorial(e, { fechaEntrada, fechaSalida, hoy, total, consumos }, idOperador);
  }
}

async function main() {
  await crearUsuarioPlataforma();
  for (const hotel of [ANDINO, SOL_CARIBE]) {
    await sembrarHotel(hotel);
  }
  console.log('\nSeed completado: 2 hoteles de demo con sus escenarios.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
