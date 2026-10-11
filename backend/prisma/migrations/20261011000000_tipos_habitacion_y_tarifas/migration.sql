-- Bloque B (tarifas reales): la tarifa y la capacidad pasan de cada habitación
-- a su TIPO (R12), y la reserva guarda huéspedes y desglose congelado (R6, R17).

CREATE TABLE "tipo_habitacion" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tarifa_base" DECIMAL(10,2) NOT NULL,
    "capacidad_incluida" INTEGER NOT NULL,
    "capacidad_maxima" INTEGER NOT NULL,
    "cargo_persona_adicional" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "tipo_habitacion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tipo_habitacion_codigo_key" ON "tipo_habitacion"("codigo");

-- Un tipo por cada valor distinto de habitacion.tipo. Tarifa base: la más
-- común entre sus habitaciones (mode(); en empate, la menor). Capacidades por
-- defecto según el nombre del tipo; se pueden ajustar luego desde la app.
INSERT INTO "tipo_habitacion"
  ("id", "codigo", "nombre", "tarifa_base", "capacidad_incluida", "capacidad_maxima", "cargo_persona_adicional")
SELECT
  gen_random_uuid()::text,
  lower("tipo"),
  initcap("tipo"),
  mode() WITHIN GROUP (ORDER BY "tarifa_noche"),
  CASE lower("tipo") WHEN 'sencilla' THEN 1 ELSE 2 END,
  CASE lower("tipo") WHEN 'sencilla' THEN 2 WHEN 'doble' THEN 3 WHEN 'suite' THEN 4 ELSE 2 END,
  40000
FROM "habitacion"
GROUP BY lower("tipo"), initcap("tipo");

ALTER TABLE "habitacion" ADD COLUMN "tipo_habitacion_id" TEXT;

UPDATE "habitacion" h
SET "tipo_habitacion_id" = t."id"
FROM "tipo_habitacion" t
WHERE t."codigo" = lower(h."tipo");

ALTER TABLE "habitacion" ALTER COLUMN "tipo_habitacion_id" SET NOT NULL;
ALTER TABLE "habitacion" ADD CONSTRAINT "habitacion_tipo_habitacion_id_fkey"
  FOREIGN KEY ("tipo_habitacion_id") REFERENCES "tipo_habitacion"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "habitacion" DROP COLUMN "tipo";
ALTER TABLE "habitacion" DROP COLUMN "tarifa_noche";

-- Reservas: número de huéspedes (las anteriores se asumen de 1) y desglose
-- congelado (null en las anteriores al motor de tarifas: conservan su precio).
ALTER TABLE "reserva" ADD COLUMN "numero_huespedes" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "reserva" ADD COLUMN "desglose" JSONB;
