-- CreateEnum
CREATE TYPE "MotivoViaje" AS ENUM ('turismo', 'negocios', 'salud', 'eventos', 'otro');

-- AlterTable
ALTER TABLE "huesped" ADD COLUMN     "nacionalidad" TEXT;

-- AlterTable
ALTER TABLE "reserva" ADD COLUMN     "motivo_viaje" "MotivoViaje",
ADD COLUMN     "procedencia" TEXT;
