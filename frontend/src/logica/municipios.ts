import type { Municipio } from '../api/types';

// A-6: como se muestra y se guarda un municipio de Colombia: "Medellín,
// Antioquia" (hay nombres repetidos en varios departamentos). Debe coincidir
// con backend/src/huespedes/divipola.ts para que el reporte reconozca su código.
export const etiquetaMunicipio = (m: Municipio) =>
  m.nombre === m.departamento ? m.nombre : `${m.nombre}, ${m.departamento}`;
