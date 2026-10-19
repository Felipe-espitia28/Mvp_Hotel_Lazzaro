-- Multi-tenant: cada hotel cliente tiene sus propios datos, marca y políticas.
-- Los datos que ya existían quedan en un hotel "Hotel Demo".

-- Rol del equipo de Lazaro (Consola Lazaro): no pertenece a ningún hotel.
ALTER TYPE "RolUsuario" ADD VALUE 'plataforma';

-- CreateTable
CREATE TABLE "hotel" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "ciudad" TEXT,
    "nit" TEXT,
    "telefono" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "eslogan" TEXT,
    "logo" TEXT,
    "color_primario" TEXT NOT NULL DEFAULT '#0f1b2d',
    "color_acento" TEXT NOT NULL DEFAULT '#c9a227',
    "fuente_titulos" TEXT NOT NULL DEFAULT 'Playfair Display',
    "fuente_texto" TEXT NOT NULL DEFAULT 'Inter',
    "politicas" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hotel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "hotel_slug_key" ON "hotel"("slug");

-- Hotel al que pasan los datos existentes.
INSERT INTO "hotel" ("id", "slug", "nombre", "ciudad")
VALUES ('00000000-0000-4000-8000-000000000001', 'hotel-demo', 'Hotel Demo', 'Bogotá');

-- Columnas hotel_id: se agregan vacías, se llenan y luego se exigen.
ALTER TABLE "usuario" ADD COLUMN "hotel_id" TEXT;
ALTER TABLE "tipo_habitacion" ADD COLUMN "hotel_id" TEXT;
ALTER TABLE "habitacion" ADD COLUMN "hotel_id" TEXT;
ALTER TABLE "huesped" ADD COLUMN "hotel_id" TEXT;
ALTER TABLE "reserva" ADD COLUMN "hotel_id" TEXT;

UPDATE "usuario" SET "hotel_id" = '00000000-0000-4000-8000-000000000001';
UPDATE "tipo_habitacion" SET "hotel_id" = '00000000-0000-4000-8000-000000000001';
UPDATE "habitacion" SET "hotel_id" = '00000000-0000-4000-8000-000000000001';
UPDATE "huesped" SET "hotel_id" = '00000000-0000-4000-8000-000000000001';
UPDATE "reserva" SET "hotel_id" = '00000000-0000-4000-8000-000000000001';

-- usuario.hotel_id queda opcional: el rol plataforma no tiene hotel.
ALTER TABLE "tipo_habitacion" ALTER COLUMN "hotel_id" SET NOT NULL;
ALTER TABLE "habitacion" ALTER COLUMN "hotel_id" SET NOT NULL;
ALTER TABLE "huesped" ALTER COLUMN "hotel_id" SET NOT NULL;
ALTER TABLE "reserva" ALTER COLUMN "hotel_id" SET NOT NULL;

-- La unicidad pasa a ser por hotel: dos hoteles pueden tener cada uno su
-- habitación 101, su tipo "doble" y su propio registro del mismo huésped.
DROP INDEX "habitacion_numero_key";
DROP INDEX "huesped_tipo_documento_documento_key";
DROP INDEX "tipo_habitacion_codigo_key";

CREATE UNIQUE INDEX "habitacion_hotel_id_numero_key" ON "habitacion"("hotel_id", "numero");
CREATE UNIQUE INDEX "huesped_hotel_id_tipo_documento_documento_key" ON "huesped"("hotel_id", "tipo_documento", "documento");
CREATE UNIQUE INDEX "tipo_habitacion_hotel_id_codigo_key" ON "tipo_habitacion"("hotel_id", "codigo");
CREATE INDEX "reserva_hotel_id_estado_idx" ON "reserva"("hotel_id", "estado");

-- AddForeignKey
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tipo_habitacion" ADD CONSTRAINT "tipo_habitacion_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "habitacion" ADD CONSTRAINT "habitacion_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "huesped" ADD CONSTRAINT "huesped_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reserva" ADD CONSTRAINT "reserva_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- La restricción reserva_sin_sobreventa no cambia: habitacion_id es único en
-- toda la plataforma, así que sigue impidiendo dos reservas solapadas.
