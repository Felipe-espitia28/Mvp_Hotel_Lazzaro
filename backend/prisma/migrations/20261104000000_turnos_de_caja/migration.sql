-- B-3 (plan 13): turnos de caja. Los pagos existentes quedan sin turno.

-- AlterTable
ALTER TABLE "pago" ADD COLUMN     "anulado_en" TIMESTAMP(3),
ADD COLUMN     "anulado_turno_id" TEXT,
ADD COLUMN     "turno_id" TEXT;

-- CreateTable
CREATE TABLE "turno" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "abierto_en" TIMESTAMP(3) NOT NULL,
    "cerrado_en" TIMESTAMP(3),
    "base_efectivo" DECIMAL(12,2) NOT NULL,
    "efectivo_contado" DECIMAL(12,2),
    "observaciones" TEXT,
    "resumen_cierre" JSONB,

    CONSTRAINT "turno_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "turno_hotel_id_abierto_en_idx" ON "turno"("hotel_id", "abierto_en");

-- AddForeignKey
ALTER TABLE "pago" ADD CONSTRAINT "pago_anulado_turno_id_fkey" FOREIGN KEY ("anulado_turno_id") REFERENCES "turno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pago" ADD CONSTRAINT "pago_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "turno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turno" ADD CONSTRAINT "turno_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turno" ADD CONSTRAINT "turno_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Un usuario tiene como maximo un turno abierto. Equivale a un indice unico
-- parcial (WHERE cerrado_en IS NULL), pero Prisma no los modela y migrate diff
-- lo borraria; una restriccion EXCLUDE no la ve (como reserva_sin_sobreventa).
ALTER TABLE "turno"
  ADD CONSTRAINT turno_uno_abierto_por_usuario
  EXCLUDE USING gist (usuario_id WITH =)
  WHERE (cerrado_en IS NULL);

ALTER TABLE "turno"
  ADD CONSTRAINT turno_base_no_negativa CHECK (base_efectivo >= 0);
