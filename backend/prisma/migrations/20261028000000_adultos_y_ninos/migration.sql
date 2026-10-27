-- AlterEnum
ALTER TYPE "TipoEventoReserva" ADD VALUE 'diferencia_edad';

-- AlterTable
ALTER TABLE "reserva" ADD COLUMN     "adultos" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "edades_ninos" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- AlterTable
ALTER TABLE "tipo_habitacion" ADD COLUMN     "cargo_nino_adicional" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Datos existentes (no se borran): las reservas anteriores se migran como
-- adultos (sus desgloses congelados no se recalculan), y el cargo por niño
-- de cada tipo arranca en la mitad del cargo por persona adicional, al peso.
UPDATE "reserva" SET "adultos" = "numero_huespedes";
ALTER TABLE "reserva" DROP COLUMN "numero_huespedes";

UPDATE "tipo_habitacion" SET "cargo_nino_adicional" = ROUND("cargo_persona_adicional" / 2);
ALTER TABLE "tipo_habitacion" ALTER COLUMN "cargo_nino_adicional" DROP DEFAULT;
