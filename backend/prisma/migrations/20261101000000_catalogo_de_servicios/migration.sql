-- S-1 (plan 08): el catálogo de consumos pasa a ser un catálogo de servicios
-- personalizable. producto_consumo se renombra a servicio SIN perder los ids
-- (los cargos antiguos siguen apuntando a su servicio) y la categoría fija pasa
-- a ser la clasificación contable de una categoría propia del hotel.

-- Clasificaciones contables nuevas (no se usan en esta migración).
ALTER TYPE "CategoriaCargo" ADD VALUE 'spa';
ALTER TYPE "CategoriaCargo" ADD VALUE 'experiencia';

CREATE TYPE "TipoAtributo" AS ENUM ('texto', 'numero', 'si_no', 'lista');
CREATE TYPE "TipoServicio" AS ENUM ('consumo', 'cita', 'experiencia');
CREATE TYPE "ModoPrecio" AS ENUM ('fijo', 'por_persona', 'por_edad');

CREATE TABLE "categoria_servicio" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "icono" TEXT,
    "clasificacion" "CategoriaCargo" NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categoria_servicio_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "categoria_servicio_hotel_id_nombre_key" ON "categoria_servicio"("hotel_id", "nombre");

ALTER TABLE "categoria_servicio" ADD CONSTRAINT "categoria_servicio_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "definicion_atributo" (
    "id" TEXT NOT NULL,
    "categoria_id" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "etiqueta" TEXT NOT NULL,
    "tipo" "TipoAtributo" NOT NULL,
    "opciones" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "obligatorio" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "definicion_atributo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "definicion_atributo_categoria_id_clave_key" ON "definicion_atributo"("categoria_id", "clave");

ALTER TABLE "definicion_atributo" ADD CONSTRAINT "definicion_atributo_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categoria_servicio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Renombrar (no borrar y crear): los ids y las referencias se conservan.
ALTER TABLE "producto_consumo" RENAME TO "servicio";
ALTER TABLE "servicio" RENAME CONSTRAINT "producto_consumo_pkey" TO "servicio_pkey";
ALTER TABLE "servicio" RENAME CONSTRAINT "producto_consumo_hotel_id_fkey" TO "servicio_hotel_id_fkey";
ALTER INDEX "producto_consumo_hotel_id_nombre_key" RENAME TO "servicio_hotel_id_nombre_key";
ALTER TABLE "cargo" RENAME COLUMN "producto_id" TO "servicio_id";
ALTER TABLE "cargo" RENAME CONSTRAINT "cargo_producto_id_fkey" TO "cargo_servicio_id_fkey";

ALTER TABLE "servicio"
    ADD COLUMN "codigo" TEXT,
    ADD COLUMN "categoria_id" TEXT,
    ADD COLUMN "descripcion" TEXT,
    ADD COLUMN "tipo" "TipoServicio" NOT NULL DEFAULT 'consumo',
    ADD COLUMN "modo_precio" "ModoPrecio" NOT NULL DEFAULT 'fijo',
    ADD COLUMN "precio_nino" DECIMAL(10,2),
    ADD COLUMN "duracion_minutos" INTEGER,
    ADD COLUMN "cupos_por_salida" INTEGER,
    ADD COLUMN "disponibilidad" JSONB,
    ADD COLUMN "fotos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "atributos" JSONB NOT NULL DEFAULT '{}',
    ADD COLUMN "visible_recepcion" BOOLEAN NOT NULL DEFAULT true;

-- Una categoría del hotel por cada clasificación que ya usa.
INSERT INTO "categoria_servicio" ("id", "hotel_id", "nombre", "orden", "clasificacion")
SELECT gen_random_uuid()::text, u."hotel_id", n."nombre", n."orden", u."categoria"
FROM (SELECT DISTINCT "hotel_id", "categoria" FROM "servicio") u
JOIN (
    VALUES
        ('minibar', 'Minibar', 1),
        ('lavanderia', 'Lavandería', 2),
        ('restaurante', 'Restaurante', 3),
        ('late_checkout', 'Late check-out', 4),
        ('otro', 'Otros', 5)
) AS n("clasificacion", "nombre", "orden") ON n."clasificacion" = u."categoria"::text;

UPDATE "servicio" s
SET "categoria_id" = c."id"
FROM "categoria_servicio" c
WHERE c."hotel_id" = s."hotel_id" AND c."clasificacion" = s."categoria";

-- Código derivado del nombre (como servicios/codigo.ts): minúsculas, sin
-- tildes, con guiones; si se repite en el hotel, con sufijo -2, -3...
WITH base AS (
    SELECT "id", "hotel_id",
        COALESCE(NULLIF(trim(BOTH '-' FROM regexp_replace(
            translate(lower("nombre"), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]+', '-', 'g')), ''), 'servicio') AS "slug"
    FROM "servicio"
), numerados AS (
    SELECT "id", "slug", row_number() OVER (PARTITION BY "hotel_id", "slug" ORDER BY "id") AS "n"
    FROM base
)
UPDATE "servicio" s
SET "codigo" = CASE WHEN n."n" = 1 THEN n."slug" ELSE n."slug" || '-' || n."n" END
FROM numerados n
WHERE n."id" = s."id";

ALTER TABLE "servicio" ALTER COLUMN "codigo" SET NOT NULL;
ALTER TABLE "servicio" ALTER COLUMN "categoria_id" SET NOT NULL;
-- La clasificación queda en la categoría.
ALTER TABLE "servicio" DROP COLUMN "categoria";

CREATE UNIQUE INDEX "servicio_hotel_id_codigo_key" ON "servicio"("hotel_id", "codigo");

ALTER TABLE "servicio" ADD CONSTRAINT "servicio_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categoria_servicio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
