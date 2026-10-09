-- Bloque A de reglas de negocio (docs/REGLAS_DE_NEGOCIO.md).

-- R10: una reserva confirmada a la que el huésped nunca llegó.
-- La restricción reserva_sin_sobreventa solo mira 'confirmada' y 'activa',
-- así que un no-show libera las fechas sin tocar la restricción.
ALTER TYPE "EstadoReserva" ADD VALUE 'no_show';

-- R5: precio de las noches congelado al confirmar la reserva.
-- Se agrega primero como opcional para poder rellenar las reservas existentes.
ALTER TABLE "reserva" ADD COLUMN "valor_alojamiento" DECIMAL(10,2);

-- Las reservas creadas antes de esta regla no guardaron su precio: se usa
-- la tarifa actual de la habitación, que es la mejor información disponible.
UPDATE "reserva" r
SET "valor_alojamiento" = (r."fecha_salida" - r."fecha_entrada") * h."tarifa_noche"
FROM "habitacion" h
WHERE h."id" = r."habitacion_id";

ALTER TABLE "reserva" ALTER COLUMN "valor_alojamiento" SET NOT NULL;
