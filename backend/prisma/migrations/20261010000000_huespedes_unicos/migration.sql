-- Un huésped se identifica por tipo + número de documento (no se duplica al
-- volver a reservar). Ver docs/REGLAS_DE_NEGOCIO.md.

CREATE TYPE "TipoDocumento" AS ENUM ('CC', 'CE', 'PASAPORTE', 'TI', 'PPT');

-- Los huéspedes existentes se asumen con cédula de ciudadanía (el único caso
-- que manejaba el sistema hasta ahora).
ALTER TABLE "huesped" ADD COLUMN "tipo_documento" "TipoDocumento" NOT NULL DEFAULT 'CC';

-- Misma normalización que aplica la API: sin puntos, espacios ni guiones, en mayúsculas.
UPDATE "huesped" SET "documento" = upper(regexp_replace("documento", '[.\s-]', '', 'g'));

-- Fusiona duplicados: las reservas pasan al registro que se conserva (el de
-- menor id) y los demás se eliminan. Así el índice único puede crearse.
WITH conservados AS (
  SELECT "tipo_documento", "documento", min("id") AS "id"
  FROM "huesped"
  GROUP BY "tipo_documento", "documento"
)
UPDATE "reserva" r
SET "huesped_id" = c."id"
FROM "huesped" h
JOIN conservados c
  ON c."tipo_documento" = h."tipo_documento" AND c."documento" = h."documento"
WHERE r."huesped_id" = h."id" AND h."id" <> c."id";

DELETE FROM "huesped" h
USING (
  SELECT "tipo_documento", "documento", min("id") AS "id"
  FROM "huesped"
  GROUP BY "tipo_documento", "documento"
) c
WHERE h."tipo_documento" = c."tipo_documento"
  AND h."documento" = c."documento"
  AND h."id" <> c."id";

CREATE UNIQUE INDEX "huesped_tipo_documento_documento_key"
  ON "huesped"("tipo_documento", "documento");
