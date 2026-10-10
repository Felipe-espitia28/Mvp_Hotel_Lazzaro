-- CreateEnum
CREATE TYPE "TipoEventoReserva" AS ENUM ('creada', 'check_in', 'check_out', 'cancelada', 'no_show');

-- CreateTable
CREATE TABLE "evento_reserva" (
    "id" TEXT NOT NULL,
    "reserva_id" TEXT NOT NULL,
    "tipo" "TipoEventoReserva" NOT NULL,
    "usuario_id" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "detalle" TEXT,

    CONSTRAINT "evento_reserva_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evento_reserva_reserva_id_idx" ON "evento_reserva"("reserva_id");

-- AddForeignKey
ALTER TABLE "evento_reserva" ADD CONSTRAINT "evento_reserva_reserva_id_fkey" FOREIGN KEY ("reserva_id") REFERENCES "reserva"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_reserva" ADD CONSTRAINT "evento_reserva_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
