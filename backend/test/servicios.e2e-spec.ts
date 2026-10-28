import { INestApplication } from '@nestjs/common';
import type TestAgent from 'supertest/lib/agent';
import { PrismaService } from '../src/prisma/prisma.service';
import { HOTEL_ANTIGUO, probarMigracion } from './migraciones';
import {
  RelojFalso,
  crearApp,
  crearHabitacion,
  cuerpoCheckIn,
  cuerpoReserva,
  reiniciar,
} from './utilidades';

// Una imagen PNG mínima como data URL (como el logo).
const FOTO =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==';

// S-1 (plan 08): catálogo de servicios personalizable. Cada hotel crea sus
// categorías con atributos propios (R54) y sus servicios, con precio fijo,
// por persona o por edad (R55).
describe('Catálogo de servicios', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reloj: RelojFalso;
  let http: () => TestAgent; // admin
  let comoRecepcionista: TestAgent;
  let comoOtroHotel: TestAgent;
  let experiencias: { id: string; atributos: { id: string }[] };

  const tour = (cambios: Record<string, unknown> = {}) => ({
    nombre: 'Tour en lancha',
    categoriaId: experiencias.id,
    tipo: 'experiencia',
    modoPrecio: 'por_edad',
    precio: 90000,
    precioNino: 45000,
    duracionMinutos: 180,
    cuposPorSalida: 12,
    atributos: { nivel_dificultad: 'baja' },
    ...cambios,
  });

  // Una reserva con la estadía activa para cargarle servicios.
  async function estadiaActiva() {
    const habitacion = await crearHabitacion(prisma);
    const { body } = await http()
      .post('/reservas')
      .send(cuerpoReserva(habitacion.id, '2030-03-10', '2030-03-12'))
      .expect(201);
    reloj.fijar('2030-03-10T15:00:00-05:00');
    await http().post(`/reservas/${body.id}/check-in`).send(cuerpoCheckIn()).expect(201);
    return body.id as string;
  }

  beforeAll(async () => {
    ({ app, prisma, reloj, http, comoRecepcionista, comoOtroHotel } = await crearApp());
  });

  beforeEach(async () => {
    await reiniciar(prisma, reloj);
    const { body } = await http()
      .post('/servicios/categorias')
      .send({ nombre: 'Experiencias', clasificacion: 'experiencia', icono: 'map' })
      .expect(201);
    const { body: atributo } = await http()
      .post(`/servicios/categorias/${body.id}/atributos`)
      .send({
        clave: 'nivel_dificultad',
        etiqueta: 'Nivel de dificultad',
        tipo: 'lista',
        opciones: ['baja', 'media', 'alta'],
        obligatorio: true,
      })
      .expect(201);
    // La etiqueta se edita; la clave (la del JSON de cada servicio) no.
    await http()
      .patch(`/servicios/categorias/${body.id}/atributos/${atributo.id}`)
      .send({ etiqueta: 'Dificultad' })
      .expect(200);
    experiencias = { id: body.id, atributos: [atributo] };
  });

  afterAll(async () => {
    await app.close();
  });

  it('crea un servicio con atributos válidos y rechaza los inválidos (400)', async () => {
    const { body } = await http().post('/servicios').send(tour()).expect(201);
    expect(body).toMatchObject({
      codigo: 'tour-en-lancha',
      tipo: 'experiencia',
      modoPrecio: 'por_edad',
      precioNino: '45000',
      atributos: { nivel_dificultad: 'baja' },
      categoria: { nombre: 'Experiencias', clasificacion: 'experiencia' },
    });

    const opcionMala = await http()
      .post('/servicios')
      .send(tour({ nombre: 'Rafting', atributos: { nivel_dificultad: 'extrema' } }))
      .expect(400);
    expect(opcionMala.body.message).toEqual(['"Dificultad" debe ser una de: baja, media, alta']);
    const sinObligatorio = await http()
      .post('/servicios')
      .send(tour({ nombre: 'Rafting', atributos: { color: 'azul' } }))
      .expect(400);
    expect(sinObligatorio.body.message).toEqual([
      'La categoría no tiene el atributo "color"',
      'Falta "Dificultad"',
    ]);
    // Los campos de su tipo: una experiencia necesita duración y cupos.
    const sinCupos = await http()
      .post('/servicios')
      .send(tour({ nombre: 'Rafting', cuposPorSalida: undefined }))
      .expect(400);
    expect(sinCupos.body.message).toEqual(['Indica los cupos por salida']);
  });

  it('lo que no aplica al tipo se limpia al cambiarlo', async () => {
    const { body } = await http().post('/servicios').send(tour()).expect(201);
    const { body: cambiado } = await http()
      .patch(`/servicios/${body.id}`)
      .send({ tipo: 'consumo', modoPrecio: 'fijo' })
      .expect(200);
    expect(cambiado).toMatchObject({
      duracionMinutos: null,
      cuposPorSalida: null,
      precioNino: null,
    });
  });

  it('un cargo por edad calcula bien y queda congelado al cambiar el precio', async () => {
    const reservaId = await estadiaActiva();
    const { body: servicio } = await http().post('/servicios').send(tour()).expect(201);

    // Rangos por defecto del hotel: gratis hasta 4 años, niño hasta 11.
    const { body: folio } = await comoRecepcionista
      .post(`/reservas/${reservaId}/cargos`)
      .send({ servicioId: servicio.id, adultos: 2, edadesNinos: [3, 8] })
      .expect(201);
    expect(folio.cargos[0]).toMatchObject({
      servicioId: servicio.id,
      categoria: 'experiencia',
      concepto: 'Tour en lancha (2 adultos, 1 niño, 1 sin costo)',
      cantidad: 1,
      total: '225000',
    });
    expect(folio.huespedes).toEqual({ adultos: 1, edadesNinos: [] });

    await http().patch(`/servicios/${servicio.id}`).send({ precio: 100000 }).expect(200);
    const { body: despues } = await http().get(`/reservas/${reservaId}/folio`).expect(200);
    expect(despues.cargos[0].total).toBe('225000');

    // Sin personas no hay precio.
    await http()
      .post(`/reservas/${reservaId}/cargos`)
      .send({ servicioId: servicio.id })
      .expect(400);
  });

  it('un cargo por persona multiplica por las personas', async () => {
    const reservaId = await estadiaActiva();
    const { body: spa } = await http()
      .post('/servicios/categorias')
      .send({ nombre: 'Spa', clasificacion: 'spa' })
      .expect(201);
    const { body: masaje } = await http()
      .post('/servicios')
      .send({
        nombre: 'Masaje 60 min',
        categoriaId: spa.id,
        tipo: 'cita',
        modoPrecio: 'por_persona',
        precio: 120000,
        duracionMinutos: 60,
      })
      .expect(201);
    const { body: folio } = await http()
      .post(`/reservas/${reservaId}/cargos`)
      .send({ servicioId: masaje.id, cantidad: 2 })
      .expect(201);
    expect(folio.cargos[0]).toMatchObject({
      concepto: 'Masaje 60 min (2 personas)',
      categoria: 'spa',
      valorUnitario: '120000',
      total: '240000',
    });
  });

  it('un servicio inactivo o de una categoría inactiva no se puede cargar', async () => {
    const reservaId = await estadiaActiva();
    const { body: servicio } = await http().post('/servicios').send(tour()).expect(201);
    const cargar = () =>
      http().post(`/reservas/${reservaId}/cargos`).send({ servicioId: servicio.id, adultos: 1 });

    await http().patch(`/servicios/${servicio.id}`).send({ activo: false }).expect(200);
    await cargar().expect(404);
    await http().patch(`/servicios/${servicio.id}`).send({ activo: true }).expect(200);
    await http()
      .patch(`/servicios/categorias/${experiencias.id}`)
      .send({ activa: false })
      .expect(200);
    await cargar().expect(404);
  });

  it('código duplicado en el mismo hotel → 409; en otro hotel está permitido', async () => {
    await http()
      .post('/servicios')
      .send(tour({ codigo: 'tour' }))
      .expect(201);
    const repetido = await http()
      .post('/servicios')
      .send(tour({ codigo: 'tour', nombre: 'Otro tour' }))
      .expect(409);
    expect(repetido.body.message).toBe('Ya existe el código "tour" en el catálogo');

    const { body: suya } = await comoOtroHotel
      .post('/servicios/categorias')
      .send({ nombre: 'Experiencias', clasificacion: 'experiencia' })
      .expect(201);
    await comoOtroHotel
      .post('/servicios')
      .send({ codigo: 'tour', nombre: 'Tour en lancha', categoriaId: suya.id, precio: 50000 })
      .expect(201);
  });

  it('recepción ve solo lo que se ofrece; el administrador, todo y con filtros', async () => {
    await http().post('/servicios').send(tour()).expect(201);
    await http()
      .post('/servicios')
      .send(tour({ nombre: 'Tour privado', visibleRecepcion: false }))
      .expect(201);
    const { body: inactivo } = await http()
      .post('/servicios')
      .send(tour({ nombre: 'Tour de invierno' }))
      .expect(201);
    await http().patch(`/servicios/${inactivo.id}`).send({ activo: false }).expect(200);

    const recepcion = await comoRecepcionista.get('/servicios').expect(200);
    expect(recepcion.body.map((s: { nombre: string }) => s.nombre)).toEqual(['Tour en lancha']);
    // La lista no trae las fotos.
    expect(recepcion.body[0].fotos).toBeUndefined();
    await comoRecepcionista
      .post('/servicios')
      .send(tour({ nombre: 'X' }))
      .expect(403);

    const todos = await http().get('/servicios').expect(200);
    expect(todos.body).toHaveLength(3);
    const activos = await http().get('/servicios?activo=true&buscar=PRIV').expect(200);
    expect(activos.body.map((s: { nombre: string }) => s.nombre)).toEqual(['Tour privado']);
    const consumos = await http().get('/servicios?tipo=consumo').expect(200);
    expect(consumos.body).toEqual([]);
  });

  it('hasta 3 fotos, con los límites del logo', async () => {
    const { body: servicio } = await http().post('/servicios').send(tour()).expect(201);
    for (let i = 0; i < 3; i++) {
      await http().post(`/servicios/${servicio.id}/fotos`).send({ foto: FOTO }).expect(201);
    }
    await http().post(`/servicios/${servicio.id}/fotos`).send({ foto: FOTO }).expect(400);
    await http()
      .post(`/servicios/${servicio.id}/fotos`)
      .send({ foto: 'data:image/svg+xml;base64,PHN2Zz4=' })
      .expect(400);

    const { body: sinUna } = await http().delete(`/servicios/${servicio.id}/fotos/1`).expect(200);
    expect(sinUna.fotos).toHaveLength(2);
    await http().delete(`/servicios/${servicio.id}/fotos/5`).expect(404);
  });

  it('ordena las categorías arrastrándolas', async () => {
    const { body: spa } = await http()
      .post('/servicios/categorias')
      .send({ nombre: 'Spa', clasificacion: 'spa' })
      .expect(201);
    const { body } = await http()
      .patch('/servicios/categorias/orden')
      .send({ ids: [spa.id, experiencias.id] })
      .expect(200);
    expect(body.map((c: { nombre: string }) => c.nombre)).toEqual(['Spa', 'Experiencias']);
    expect(body[1].atributos).toHaveLength(1);
  });

  it('la clave de un atributo sale de su etiqueta y una lista necesita opciones', async () => {
    const { body } = await http()
      .post(`/servicios/categorias/${experiencias.id}/atributos`)
      .send({ etiqueta: 'Incluye transporte', tipo: 'si_no', opciones: ['ignorada'] })
      .expect(201);
    expect(body).toMatchObject({ clave: 'incluye_transporte', opciones: [] });
    await http()
      .post(`/servicios/categorias/${experiencias.id}/atributos`)
      .send({ etiqueta: 'Idioma', tipo: 'lista', opciones: [] })
      .expect(400);
    await http()
      .post(`/servicios/categorias/${experiencias.id}/atributos`)
      .send({ etiqueta: 'Incluye transporte', tipo: 'texto' })
      .expect(409);
  });

  it('cada hotel tiene sus categorías, atributos y servicios', async () => {
    const { body: servicio } = await http().post('/servicios').send(tour()).expect(201);
    const atributoId = experiencias.atributos[0].id;

    const { body: categorias } = await comoOtroHotel.get('/servicios/categorias').expect(200);
    expect(categorias).toEqual([]);
    await comoOtroHotel
      .patch(`/servicios/categorias/${experiencias.id}`)
      .send({ nombre: 'Mía' })
      .expect(404);
    await comoOtroHotel
      .post(`/servicios/categorias/${experiencias.id}/atributos`)
      .send({ etiqueta: 'Intruso', tipo: 'texto' })
      .expect(404);
    await comoOtroHotel
      .patch(`/servicios/categorias/${experiencias.id}/atributos/${atributoId}`)
      .send({ obligatorio: false })
      .expect(404);
    await comoOtroHotel
      .patch('/servicios/categorias/orden')
      .send({ ids: [experiencias.id] })
      .expect(404);
    await comoOtroHotel.get(`/servicios/${servicio.id}`).expect(404);
    await comoOtroHotel.patch(`/servicios/${servicio.id}`).send({ precio: 1 }).expect(404);
    await comoOtroHotel.post(`/servicios/${servicio.id}/fotos`).send({ foto: FOTO }).expect(404);
  });

  it('la migración conserva los ids y los cargos antiguos siguen apuntando a su servicio', async () => {
    await probarMigracion(
      '20261101000000_catalogo_de_servicios',
      [
        HOTEL_ANTIGUO[0],
        `INSERT INTO tipo_habitacion (id, hotel_id, codigo, nombre, tarifa_base, capacidad_incluida, capacidad_maxima, cargo_persona_adicional, cargo_nino_adicional)
         VALUES ('t1', 'h1', 'doble', 'Doble', 100000, 2, 3, 30000, 15000)`,
        HOTEL_ANTIGUO[2],
        `INSERT INTO huesped (id, hotel_id, nombre, primer_nombre, documento) VALUES ('g1', 'h1', 'Ana', 'Ana', '111')`,
        `INSERT INTO usuario (id, hotel_id, nombre, email, contrasena_hash, rol) VALUES ('u1', 'h1', 'Recepción', 'r@h1.test', 'x', 'recepcionista')`,
        `INSERT INTO reserva (id, hotel_id, habitacion_id, huesped_id, fecha_entrada, fecha_salida, estado, valor_alojamiento)
         VALUES ('r1', 'h1', 'c1', 'g1', '2026-01-10', '2026-01-12', 'activa', 200000)`,
        `INSERT INTO producto_consumo (id, hotel_id, nombre, categoria, precio) VALUES
           ('p1', 'h1', 'Agua 600 ml', 'minibar', 6000),
           ('p2', 'h1', 'Lavado de pantalón', 'lavanderia', 30000),
           ('p3', 'h1', 'Agua 600 ML', 'minibar', 6500)`,
        `INSERT INTO cargo (id, reserva_id, producto_id, categoria, concepto, cantidad, valor_unitario, total, usuario_id)
         VALUES ('k1', 'r1', 'p1', 'minibar', 'Agua 600 ml', 2, 6000, 12000, 'u1')`,
      ],
      async (cliente) => {
        // (La migración multi-hotel creó además un hotel por defecto con su catálogo.)
        const servicios = await cliente.servicio.findMany({
          where: { hotelId: 'h1' },
          include: { categoria: true },
          orderBy: { id: 'asc' },
        });
        expect(
          servicios.map((s) => [s.id, s.codigo, s.categoria.nombre, s.categoria.clasificacion]),
        ).toEqual([
          ['p1', 'agua-600-ml', 'Minibar', 'minibar'],
          ['p2', 'lavado-de-pantalon', 'Lavandería', 'lavanderia'],
          // El código repetido en el hotel recibe un sufijo.
          ['p3', 'agua-600-ml-2', 'Minibar', 'minibar'],
        ]);
        expect(servicios[0]).toMatchObject({ tipo: 'consumo', modoPrecio: 'fijo', fotos: [] });
        const cargo = await cliente.cargo.findUniqueOrThrow({ where: { id: 'k1' } });
        expect(cargo.servicioId).toBe('p1');
        expect(await cliente.categoriaServicio.count({ where: { hotelId: 'h1' } })).toBe(2);
      },
    );
  }, 180000);
});
