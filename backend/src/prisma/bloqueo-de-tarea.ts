import { Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';

const logger = new Logger('TareasProgramadas');

// Ninguna tarea programada dura más que esto; pasado el plazo, PostgreSQL
// libera el bloqueo aunque el proceso se haya colgado.
const DURACION_MAXIMA_MS = 5 * 60_000;

// D-04: con varias instancias del backend, cada una dispararía sus @Cron. Este
// bloqueo de PostgreSQL deja correr la tarea a una sola por vuelta: la primera
// toma el bloqueo y las demás omiten esa vuelta. Es un bloqueo de transacción
// (pg_try_advisory_xact_lock), así que se libera solo al terminar, también si
// el trabajo falla o la instancia se cae. Devuelve si esta instancia ejecutó
// el trabajo.
export async function conBloqueoDeTarea(
  prisma: PrismaService,
  tarea: string,
  trabajo: () => Promise<unknown>,
): Promise<boolean> {
  const corrio = await prisma.$transaction(
    async (tx) => {
      const [{ obtenido }] = await tx.$queryRaw<{ obtenido: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(hashtext(${tarea})) AS obtenido`;
      if (!obtenido) return false;
      await trabajo();
      return true;
    },
    { maxWait: 5_000, timeout: DURACION_MAXIMA_MS },
  );
  if (!corrio) {
    logger.debug(`"${tarea}" la está ejecutando otra instancia; se omite esta vuelta`);
  }
  return corrio;
}
