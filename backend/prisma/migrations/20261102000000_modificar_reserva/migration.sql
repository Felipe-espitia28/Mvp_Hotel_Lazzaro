-- A-5 (plan 10): modificar una reserva sin cancelarla. El evento guarda el
-- antes, el después y el desglose reemplazado.
ALTER TYPE "TipoEventoReserva" ADD VALUE 'modificada';

ALTER TABLE "evento_reserva" ADD COLUMN "datos" JSONB;
