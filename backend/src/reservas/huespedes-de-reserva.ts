import { Prisma } from '@prisma/client';

// A-3: la reserva guarda adultos y la edad de cada niño; el total de huéspedes
// se calcula (no se guarda) y se agrega a las respuestas, que el frontend usa.
export const numeroHuespedes = (r: { adultos: number; edadesNinos: number[] }) =>
  r.adultos + r.edadesNinos.length;

export const conNumeroHuespedes = <T extends { adultos: number; edadesNinos: number[] }>(r: T) => ({
  ...r,
  numeroHuespedes: numeroHuespedes(r),
});

const listaDeEdades = (edades: number[]) =>
  edades.length === 0
    ? 'ningún niño'
    : `${edades.length === 1 ? 'un niño de' : 'niños de'} ${edades.join(', ').replace(/, (\d+)$/, ' y $1')} años`;

// A-3: aviso cuando las edades de niño registradas en el check-in no son las
// declaradas al reservar. null = coinciden.
export function avisoDiferenciaEdad(declaradas: number[], registradas: number[]) {
  if (declaradas.join(',') === registradas.join(',')) return null;
  return `Al reservar se declaró ${listaDeEdades(declaradas)}; en el check-in se registró ${listaDeEdades(registradas)}. Se conserva el precio pactado.`;
}

// A-2: días antes de la llegada en que una reserva sin anticipo se marca.
const DIAS_AVISO_ANTICIPO = 7;
const MS_DIA = 24 * 60 * 60 * 1000;

// A-2: "anticipo pendiente" (solo si el hotel lo exige; no bloquea): reserva
// confirmada con anticipo sugerido, sin anticipos y que llega pronto.
export function anticipoPendiente(
  r: { estado: string; anticipoSugerido: Prisma.Decimal | null; fechaEntrada: Date },
  anticipos: number,
  hoy: Date,
  obligatorio: boolean,
) {
  return (
    obligatorio &&
    r.estado === 'confirmada' &&
    (r.anticipoSugerido?.toNumber() ?? 0) > 0 &&
    anticipos === 0 &&
    r.fechaEntrada.getTime() <= hoy.getTime() + DIAS_AVISO_ANTICIPO * MS_DIA
  );
}

// R43: el titular primero; los acompañantes, por nombre.
export const ORDEN_OCUPANTES: Prisma.OcupanteOrderByWithRelationInput[] = [
  { titular: 'desc' },
  { huesped: { nombre: 'asc' } },
];
