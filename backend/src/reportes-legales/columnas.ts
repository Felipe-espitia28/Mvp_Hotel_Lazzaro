import type { Columna } from './csv';

// ⚖️ Columnas de los reportes, en el orden de las guías de la TRA (MinCIT) y
// del SIRE (Migración Colombia) descritas en docs/REGISTRO_LEGAL_HUESPEDES.md.
// Hay que confirmarlas con un usuario de prueba de cada plataforma: cambiar
// el orden o un encabezado es editar estas listas.

// Una fila por ocupante. Acompañantes y valor pagado van solo en la fila del titular.
export interface FilaTra {
  reservaId: string;
  titular: boolean;
  tipoDocumento: string;
  documento: string;
  nombres: string;
  apellidos: string;
  nacionalidad: string;
  paisResidencia: string;
  ciudadResidencia: string;
  codigoCiudadResidencia: string; // DIVIPOLA, si es una ciudad de Colombia
  paisProcedencia: string;
  ciudadProcedencia: string;
  codigoCiudadProcedencia: string;
  habitacion: string;
  motivoViaje: string;
  acompanantes: number | '';
  fechaEntrada: string;
  fechaSalida: string;
  tipoAlojamiento: string;
  valorPagado: string; // vacío si la estadía sigue activa
}

export const COLUMNAS_TRA: Columna<FilaTra>[] = [
  { clave: 'tipoDocumento', encabezado: 'Tipo de documento' },
  { clave: 'documento', encabezado: 'Número de documento' },
  { clave: 'nombres', encabezado: 'Nombres' },
  { clave: 'apellidos', encabezado: 'Apellidos' },
  { clave: 'nacionalidad', encabezado: 'Nacionalidad' },
  { clave: 'paisResidencia', encabezado: 'País de residencia' },
  { clave: 'ciudadResidencia', encabezado: 'Ciudad de residencia' },
  { clave: 'codigoCiudadResidencia', encabezado: 'Código DIVIPOLA de residencia' },
  { clave: 'paisProcedencia', encabezado: 'País de procedencia' },
  { clave: 'ciudadProcedencia', encabezado: 'Ciudad de procedencia' },
  { clave: 'codigoCiudadProcedencia', encabezado: 'Código DIVIPOLA de procedencia' },
  { clave: 'habitacion', encabezado: 'Habitación' },
  { clave: 'motivoViaje', encabezado: 'Motivo del viaje' },
  { clave: 'acompanantes', encabezado: 'Número de acompañantes' },
  { clave: 'fechaEntrada', encabezado: 'Fecha de entrada' },
  { clave: 'fechaSalida', encabezado: 'Fecha de salida' },
  { clave: 'tipoAlojamiento', encabezado: 'Tipo de alojamiento' },
  { clave: 'valorPagado', encabezado: 'Valor pagado' },
];

// Un movimiento por extranjero: E al entrar (check-in) y S al salir (check-out).
export interface FilaSire {
  reservaId: string;
  movimiento: 'E' | 'S';
  fecha: string;
  tipoDocumento: string;
  documento: string;
  apellidos: string;
  nombres: string;
  nacionalidad: string;
  fechaNacimiento: string;
}

export const COLUMNAS_SIRE: Columna<FilaSire>[] = [
  { clave: 'movimiento', encabezado: 'Tipo de movimiento' },
  { clave: 'fecha', encabezado: 'Fecha del movimiento' },
  { clave: 'tipoDocumento', encabezado: 'Tipo de documento' },
  { clave: 'documento', encabezado: 'Número de documento' },
  { clave: 'apellidos', encabezado: 'Apellidos' },
  { clave: 'nombres', encabezado: 'Nombres' },
  { clave: 'nacionalidad', encabezado: 'Nacionalidad' },
  { clave: 'fechaNacimiento', encabezado: 'Fecha de nacimiento' },
];
