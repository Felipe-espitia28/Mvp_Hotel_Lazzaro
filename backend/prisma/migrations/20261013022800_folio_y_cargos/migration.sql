-- CreateEnum
CREATE TYPE "CategoriaCargo" AS ENUM ('minibar', 'lavanderia', 'restaurante', 'late_checkout', 'otro');

-- CreateEnum
CREATE TYPE "MedioPago" AS ENUM ('efectivo', 'tarjeta', 'transferencia');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoEventoReserva" ADD VALUE 'cargo_agregado';
ALTER TYPE "TipoEventoReserva" ADD VALUE 'cargo_anulado';

-- AlterTable
ALTER TABLE "reserva" ADD COLUMN     "medio_pago" "MedioPago";

-- CreateTable
CREATE TABLE "cargo" (
    "id" TEXT NOT NULL,
    "reserva_id" TEXT NOT NULL,
    "categoria" "CategoriaCargo" NOT NULL,
    "concepto" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "valor_unitario" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_id" TEXT NOT NULL,
    "anulado" BOOLEAN NOT NULL DEFAULT false,
    "motivo_anulacion" TEXT,

    CONSTRAINT "cargo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cargo_reserva_id_idx" ON "cargo"("reserva_id");

-- AddForeignKey
ALTER TABLE "cargo" ADD CONSTRAINT "cargo_reserva_id_fkey" FOREIGN KEY ("reserva_id") REFERENCES "reserva"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargo" ADD CONSTRAINT "cargo_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
