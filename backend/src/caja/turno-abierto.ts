import { Prisma } from '@prisma/client';

// B-3: el turno abierto de un usuario, para atarle un pago o una anulación
// (null = sin turno: se permite, y va al aviso del admin). FOR SHARE ordena el
// pago con un cierre simultáneo: si el cierre llega primero, el pago espera y
// queda sin turno; si el pago llega primero, el cierre espera y lo incluye.
export async function turnoAbiertoDe(tx: Prisma.TransactionClient, usuarioId: string) {
  const [turno] = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM turno WHERE usuario_id = ${usuarioId} AND cerrado_en IS NULL FOR SHARE`;
  return turno?.id ?? null;
}
