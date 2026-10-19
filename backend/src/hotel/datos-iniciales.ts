import { RANGOS_SUGERIDOS } from '../tarifas/temporadas';

// Datos con los que nace un hotel nuevo en la plataforma (y el de la demo).
// Son una sugerencia: el administrador del hotel los ajusta desde la Gerencia.

// Tipos de habitación (R12): tarifa base en temporada baja, capacidades y cargo
// por persona adicional.
export const TIPOS_INICIALES = [
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

// Temporadas sugeridas para Colombia (R15), como filas de la tabla temporada.
export const TEMPORADAS_INICIALES = RANGOS_SUGERIDOS.map((r) => ({
  nombre: r.nombre,
  tipo: r.temporada,
  desde: r.desde,
  hasta: r.hasta,
}));

// Catálogo de consumos de partida (R22): valor final por unidad.
export const PRODUCTOS_INICIALES = [
  { nombre: 'Agua 600 ml', categoria: 'minibar', precio: 6000 },
  { nombre: 'Gaseosa', categoria: 'minibar', precio: 5000 },
  { nombre: 'Cerveza nacional', categoria: 'minibar', precio: 9000 },
  { nombre: 'Snack', categoria: 'minibar', precio: 7000 },
  { nombre: 'Lavado de camisas', categoria: 'lavanderia', precio: 25000 },
  { nombre: 'Lavado de pantalón', categoria: 'lavanderia', precio: 30000 },
  { nombre: 'Desayuno adicional', categoria: 'restaurante', precio: 25000 },
  { nombre: 'Late check-out (hasta las 3 p. m.)', categoria: 'late_checkout', precio: 50000 },
] as const;
