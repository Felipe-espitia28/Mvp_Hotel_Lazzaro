import { RANGOS_SUGERIDOS } from '../tarifas/temporadas';

// Datos con los que nace un hotel nuevo en la plataforma (y el de la demo).
// Son una sugerencia: el administrador del hotel los ajusta desde la Gerencia.

// Tipos de habitación (R12): tarifa base en temporada baja, capacidades y cargo
// por persona adicional y por niño (A-3).
export const TIPOS_INICIALES = [
  {
    codigo: 'sencilla',
    nombre: 'Sencilla',
    tarifaBase: 80000,
    capacidadIncluida: 1,
    capacidadMaxima: 2,
    cargoPersonaAdicional: 35000,
    cargoNinoAdicional: 17500,
  },
  {
    codigo: 'doble',
    nombre: 'Doble',
    tarifaBase: 130000,
    capacidadIncluida: 2,
    capacidadMaxima: 3,
    cargoPersonaAdicional: 40000,
    cargoNinoAdicional: 20000,
  },
  {
    codigo: 'suite',
    nombre: 'Suite',
    tarifaBase: 220000,
    capacidadIncluida: 2,
    capacidadMaxima: 4,
    cargoPersonaAdicional: 50000,
    cargoNinoAdicional: 25000,
  },
];

// Temporadas sugeridas para Colombia (R15), como filas de la tabla temporada.
export const TEMPORADAS_INICIALES = RANGOS_SUGERIDOS.map((r) => ({
  nombre: r.nombre,
  tipo: r.temporada,
  desde: r.desde,
  hasta: r.hasta,
}));

// Catálogo de servicios de partida (S-1, R22): categorías propias del hotel,
// cada una con su clasificación contable, sus atributos de ejemplo (R54) y sus
// servicios. Precios: valor final, impuestos incluidos.
export const CATEGORIAS_INICIALES = [
  {
    nombre: 'Minibar',
    clasificacion: 'minibar',
    icono: 'wine',
    atributos: [],
    servicios: [
      { codigo: 'agua-600-ml', nombre: 'Agua 600 ml', precio: 6000 },
      { codigo: 'gaseosa', nombre: 'Gaseosa', precio: 5000 },
      { codigo: 'cerveza-nacional', nombre: 'Cerveza nacional', precio: 9000 },
      { codigo: 'snack', nombre: 'Snack', precio: 7000 },
    ],
  },
  {
    nombre: 'Lavandería',
    clasificacion: 'lavanderia',
    icono: 'shirt',
    atributos: [],
    servicios: [
      { codigo: 'lavado-de-camisas', nombre: 'Lavado de camisas', precio: 25000 },
      { codigo: 'lavado-de-pantalon', nombre: 'Lavado de pantalón', precio: 30000 },
    ],
  },
  {
    nombre: 'Restaurante',
    clasificacion: 'restaurante',
    icono: 'utensils',
    atributos: [],
    servicios: [{ codigo: 'desayuno-adicional', nombre: 'Desayuno adicional', precio: 25000 }],
  },
  {
    nombre: 'Late check-out',
    clasificacion: 'late_checkout',
    icono: 'clock',
    atributos: [],
    servicios: [
      {
        codigo: 'late-check-out',
        nombre: 'Late check-out (hasta las 3 p. m.)',
        precio: 50000,
      },
    ],
  },
  {
    nombre: 'Spa',
    clasificacion: 'spa',
    icono: 'sparkles',
    atributos: [
      { clave: 'cita_previa', etiqueta: 'Requiere cita previa', tipo: 'si_no', opciones: [] },
    ],
    servicios: [
      {
        codigo: 'masaje-relajante-60',
        nombre: 'Masaje relajante 60 min',
        tipo: 'cita',
        modoPrecio: 'por_persona',
        precio: 120000,
        duracionMinutos: 60,
        atributos: { cita_previa: true },
      },
    ],
  },
  {
    nombre: 'Experiencias',
    clasificacion: 'experiencia',
    icono: 'map',
    atributos: [
      {
        clave: 'nivel_dificultad',
        etiqueta: 'Nivel de dificultad',
        tipo: 'lista',
        opciones: ['baja', 'media', 'alta'],
      },
    ],
    servicios: [
      {
        codigo: 'tour-en-lancha',
        nombre: 'Tour en lancha',
        tipo: 'experiencia',
        modoPrecio: 'por_edad',
        precio: 90000,
        precioNino: 45000,
        duracionMinutos: 180,
        cuposPorSalida: 12,
        atributos: { nivel_dificultad: 'baja' },
      },
    ],
  },
] as const;

// ⚖️ R45 (Ley 1581 de 2012): texto de partida de la política de tratamiento
// de datos, mientras el hotel no escriba la suya. Validar con un asesor legal.
export const TEXTO_POLITICA_DATOS_POR_DEFECTO = `Autorizo al hotel a tratar mis datos personales y los de los menores a mi cargo para registrar mi estadía, cumplir los reportes que exige la ley (Tarjeta de Registro de Alojamiento ante el MinCIT y, si soy extranjero, el reporte a Migración Colombia), facturar y atender mis solicitudes. Conozco mis derechos a conocer, actualizar, rectificar y suprimir mis datos y a revocar esta autorización, en los términos de la Ley 1581 de 2012 y el Decreto 1377 de 2013, escribiendo a la recepción del hotel.`;
