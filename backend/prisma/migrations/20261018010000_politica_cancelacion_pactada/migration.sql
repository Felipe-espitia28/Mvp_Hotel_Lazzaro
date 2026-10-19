-- R5/R9: la política de cancelación vigente al reservar queda pactada en la
-- reserva (límite de cancelación gratuita y noches de penalidad). Las reservas
-- anteriores quedan en null y usan la política vigente del hotel.
ALTER TABLE "reserva" ADD COLUMN "cancelacion_gratuita_hasta" TIMESTAMP(3),
ADD COLUMN "noches_penalidad" INTEGER;
