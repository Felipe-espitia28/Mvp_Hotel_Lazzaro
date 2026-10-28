import { INestApplication } from '@nestjs/common';
import type TestAgent from 'supertest/lib/agent';
import { PrismaService } from '../src/prisma/prisma.service';
import { RelojFalso, crearApp, reiniciar } from './utilidades';

// S-1 (plan 09, R56): carga masiva del catálogo de una categoría desde un CSV o
// Excel. El código actualiza o crea; nada se borra; todo o nada.
describe('Importación del catálogo de servicios', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reloj: RelojFalso;
  let http: () => TestAgent; // admin
  let comoOtroHotel: TestAgent;
  let comoRecepcionista: TestAgent;
  let experiencias: string;

  const importar = (filas: Record<string, unknown>[], soloValidar = false) =>
    http()
      .post(
        `/servicios/categorias/${experiencias}/importar${soloValidar ? '?soloValidar=true' : ''}`,
      )
      .send({ filas });

  // Una fila como la escribe el hotel: los encabezados de la plantilla.
  const fila = (cambios: Record<string, unknown>) => ({
    codigo: 'tour-manglares',
    nombre: 'Tour por los manglares',
    tipo: 'experiencia',
    modo_precio: 'por edad',
    precio: '90.000',
    precio_nino: '45.000',
    duracion_minutos: '180',
    cupos_por_salida: '12',
    'Nivel de dificultad': 'Baja',
    ...cambios,
  });

  beforeAll(async () => {
    ({ app, prisma, reloj, http, comoOtroHotel, comoRecepcionista } = await crearApp());
  });

  beforeEach(async () => {
    await reiniciar(prisma, reloj);
    const { body } = await http()
      .post('/servicios/categorias')
      .send({ nombre: 'Experiencias', clasificacion: 'experiencia' })
      .expect(201);
    experiencias = body.id;
    await http()
      .post(`/servicios/categorias/${experiencias}/atributos`)
      .send({
        clave: 'nivel_dificultad',
        etiqueta: 'Nivel de dificultad',
        tipo: 'lista',
        opciones: ['baja', 'media', 'alta'],
      })
      .expect(201);
    await http()
      .post(`/servicios/categorias/${experiencias}/atributos`)
      .send({ clave: 'transporte', etiqueta: 'Incluye transporte', tipo: 'si_no' })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it('la plantilla trae las columnas fijas y las de los atributos propios', async () => {
    const res = await http().get(`/servicios/categorias/${experiencias}/plantilla`).expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    const [encabezados, ejemplo] = res.text.replace('﻿', '').split('\r\n');
    expect(encabezados.split(';')).toEqual([
      'codigo',
      'nombre',
      'descripcion',
      'tipo',
      'modo_precio',
      'precio',
      'precio_nino',
      'duracion_minutos',
      'cupos_por_salida',
      'visible_recepcion',
      'activo',
      'Nivel de dificultad',
      'Incluye transporte',
    ]);
    // La fila de ejemplo es válida: se puede importar tal cual.
    const valores = ejemplo.split(';');
    const comoFila = Object.fromEntries(encabezados.split(';').map((e, i) => [e, valores[i]]));
    const { body } = await importar([comoFila], true).expect(200);
    expect(body.filas[0].errores).toEqual([]);
    expect(body.resumen).toMatchObject({ crear: 1, error: 0 });
  });

  it('3 filas nuevas y 1 actualización: el resumen es correcto y los datos quedan guardados', async () => {
    const { body: existente } = await http()
      .post('/servicios')
      .send({
        codigo: 'kayak',
        nombre: 'Kayak',
        categoriaId: experiencias,
        precio: 50000,
        descripcion: 'Una hora en el río',
        atributos: { nivel_dificultad: 'media', transporte: true },
      })
      .expect(201);
    // Un servicio que no viene en el archivo sigue igual.
    const { body: fuera } = await http()
      .post('/servicios')
      .send({ codigo: 'buceo', nombre: 'Buceo', categoriaId: experiencias, precio: 200000 })
      .expect(201);

    const filas = [
      fila({}),
      fila({ codigo: 'avistamiento', nombre: 'Avistamiento de aves', 'Incluye transporte': 'sí' }),
      {
        codigo: 'cena-playa',
        nombre: 'Cena en la playa',
        tipo: 'consumo',
        precio: '150000',
        visible_recepcion: 'no',
      },
      // La actualización: solo el precio (con coma decimal) y la dificultad.
      { codigo: 'KAYAK', precio: '55.000,50', 'Nivel de dificultad': 'ALTA' },
      // Una fila en blanco al final de un Excel se ignora.
      { codigo: '', nombre: '' },
    ];
    const { body: previa } = await importar(filas, true).expect(200);
    expect(previa.resumen).toEqual({ total: 4, crear: 3, actualizar: 1, error: 0 });
    expect(await prisma.servicio.count({ where: { categoriaId: experiencias } })).toBe(2);

    const { body } = await importar(filas).expect(201);
    expect(body.resumen).toEqual({ total: 4, crear: 3, actualizar: 1, error: 0 });

    const tour = await prisma.servicio.findFirstOrThrow({ where: { codigo: 'tour-manglares' } });
    expect(tour).toMatchObject({
      tipo: 'experiencia',
      modoPrecio: 'por_edad',
      duracionMinutos: 180,
      cuposPorSalida: 12,
      atributos: { nivel_dificultad: 'baja' },
      visibleRecepcion: true,
    });
    // "90.000" se lee como 90000.
    expect(tour.precio.toNumber()).toBe(90000);
    expect(tour.precioNino?.toNumber()).toBe(45000);
    const cena = await prisma.servicio.findFirstOrThrow({ where: { codigo: 'cena-playa' } });
    expect(cena).toMatchObject({ visibleRecepcion: false, duracionMinutos: null });
    const avistamiento = await prisma.servicio.findFirstOrThrow({
      where: { codigo: 'avistamiento' },
    });
    expect(avistamiento.atributos).toEqual({ nivel_dificultad: 'baja', transporte: true });

    // La celda vacía no borra: la descripción y el otro atributo se conservan.
    const kayak = await prisma.servicio.findUniqueOrThrow({ where: { id: existente.id } });
    expect(kayak).toMatchObject({
      nombre: 'Kayak',
      descripcion: 'Una hora en el río',
      atributos: { nivel_dificultad: 'alta', transporte: true },
    });
    expect(kayak.precio.toNumber()).toBe(55000.5);
    const buceo = await prisma.servicio.findUniqueOrThrow({ where: { id: fuera.id } });
    expect(buceo.precio.toNumber()).toBe(200000);
    expect(buceo.activo).toBe(true);
  });

  it('una opción de lista inválida: nada se guarda y el error nombra la fila y la columna', async () => {
    const filas = [
      fila({}),
      fila({ codigo: 'rafting', nombre: 'Rafting', 'Nivel de dificultad': 'extrema' }),
    ];
    const { body } = await importar(filas).expect(400);
    expect(body.message).toBe('1 fila tiene errores: no se importó ninguna');
    expect(body.informe.filas[1]).toEqual({
      fila: 3,
      numero: 'rafting',
      estado: 'error',
      errores: ['"Nivel de dificultad" debe ser una de: baja, media, alta'],
    });
    expect(await prisma.servicio.count({ where: { hotelId: experiencias } })).toBe(0);
    expect(await prisma.servicio.count({ where: { categoriaId: experiencias } })).toBe(0);
  });

  it('usa las mismas validaciones que el alta manual, con la columna de cada error', async () => {
    const { body } = await importar(
      [
        fila({ precio: '0' }),
        fila({ codigo: 'b', nombre: 'B', precio: 'gratis' }),
        fila({ codigo: 'c', nombre: 'C', cupos_por_salida: '' }),
        fila({ codigo: 'd', nombre: 'D', tipo: 'paseo' }),
        fila({ codigo: 'e', nombre: 'E', activo: 'quizás' }),
        fila({ codigo: '', nombre: 'Sin código' }),
      ],
      true,
    ).expect(200);
    expect(body.filas.map((f: { errores: string[] }) => f.errores)).toEqual([
      ['Columna "precio": El precio debe ser mayor que 0'],
      ['Columna "precio": "gratis" no es un número'],
      ['Indica los cupos por salida'],
      ['Columna "tipo": El tipo debe ser consumo, cita o experiencia'],
      ['Columna "activo": escribe si o no'],
      ['Falta el código'],
    ]);
  });

  it('un código repetido dentro del archivo da error en las dos filas', async () => {
    const { body } = await importar(
      [fila({}), fila({ nombre: 'Otro tour' }), fila({ codigo: 'otro', nombre: 'Otro' })],
      true,
    ).expect(200);
    expect(body.filas.map((f: { estado: string }) => f.estado)).toEqual([
      'error',
      'error',
      'crear',
    ]);
    expect(body.filas[0].errores).toEqual([
      'El código tour-manglares está repetido en el archivo (filas 2 y 3)',
    ]);
    expect(body.filas[1].errores).toEqual(body.filas[0].errores);
  });

  it('un código de otra categoría o un nombre ya usado son errores', async () => {
    const { body: minibar } = await http()
      .post('/servicios/categorias')
      .send({ nombre: 'Minibar', clasificacion: 'minibar' })
      .expect(201);
    await http()
      .post('/servicios')
      .send({ codigo: 'agua', nombre: 'Agua', categoriaId: minibar.id, precio: 6000 })
      .expect(201);

    const { body } = await importar(
      [{ codigo: 'agua', nombre: 'Agua', precio: '6000' }, fila({ nombre: 'Agua' })],
      true,
    ).expect(200);
    expect(body.filas[0].errores).toEqual([
      'El código agua ya está en la categoría "Minibar"',
      'El nombre "Agua" está repetido en el archivo (filas 2 y 3)',
    ]);
    expect(body.filas[1].errores).toEqual([
      'El nombre "Agua" está repetido en el archivo (filas 2 y 3)',
      'Ya existe otro servicio llamado "Agua" (código agua)',
    ]);
  });

  it('solo el administrador importa, y la categoría de otro hotel responde 404', async () => {
    await comoRecepcionista
      .post(`/servicios/categorias/${experiencias}/importar`)
      .send({ filas: [fila({})] })
      .expect(403);
    await comoOtroHotel
      .post(`/servicios/categorias/${experiencias}/importar?soloValidar=true`)
      .send({ filas: [fila({})] })
      .expect(404);
    await comoOtroHotel.get(`/servicios/categorias/${experiencias}/plantilla`).expect(404);
    await importar([]).expect(400);
  });
});
