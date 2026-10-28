-- B-5 (plan 16): cuenta empresa y folio dividido. Las reservas, los cargos y
-- los pagos existentes quedan del huésped (default).

-- CreateEnum
CREATE TYPE "ReglaEmpresa" AS ENUM ('alojamiento', 'todo');

-- CreateEnum
CREATE TYPE "Responsable" AS ENUM ('huesped', 'empresa');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoEventoReserva" ADD VALUE 'cargo_movido';
ALTER TYPE "TipoEventoReserva" ADD VALUE 'empresa_asignada';

-- AlterTable
ALTER TABLE "cargo" ADD COLUMN     "responsable" "Responsable" NOT NULL DEFAULT 'huesped';

-- AlterTable
ALTER TABLE "pago" ADD COLUMN     "responsable" "Responsable" NOT NULL DEFAULT 'huesped';

-- AlterTable
ALTER TABLE "reserva" ADD COLUMN     "empresa_id" TEXT,
ADD COLUMN     "regla_empresa" "ReglaEmpresa" NOT NULL DEFAULT 'alojamiento';

-- CreateTable
CREATE TABLE "empresa" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "nit" TEXT NOT NULL,
    "digito_verificacion" TEXT NOT NULL,
    "razon_social" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefono" TEXT,
    "credito" BOOLEAN NOT NULL DEFAULT false,
    "dias_credito" INTEGER,
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "empresa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "empresa_hotel_id_nit_key" ON "empresa"("hotel_id", "nit");

-- AddForeignKey
ALTER TABLE "reserva" ADD CONSTRAINT "reserva_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empresa" ADD CONSTRAINT "empresa_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Los días de crédito, si hay, no son negativos.
ALTER TABLE "empresa" ADD CONSTRAINT "empresa_dias_credito_positivos" CHECK ("dias_credito" IS NULL OR "dias_credito" >= 0);
