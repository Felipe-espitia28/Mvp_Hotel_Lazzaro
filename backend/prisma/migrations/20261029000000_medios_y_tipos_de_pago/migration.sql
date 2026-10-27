-- A-1: valores nuevos de los enums. Van en su propia migración: PostgreSQL no
-- deja usar un valor de enum en la misma transacción que lo agrega, y la
-- migración siguiente (pagos_del_folio) usa 'otro'.

-- CreateEnum
CREATE TYPE "TipoPago" AS ENUM ('abono', 'anticipo', 'reembolso');

-- AlterEnum
ALTER TYPE "MedioPago" ADD VALUE 'pasarela';
ALTER TYPE "MedioPago" ADD VALUE 'otro';

-- AlterEnum
ALTER TYPE "TipoEventoReserva" ADD VALUE 'pago_registrado';
ALTER TYPE "TipoEventoReserva" ADD VALUE 'pago_anulado';
