-- DropForeignKey
ALTER TABLE "evento_reserva" DROP CONSTRAINT "evento_reserva_usuario_id_fkey";

-- AddForeignKey
ALTER TABLE "evento_reserva" ADD CONSTRAINT "evento_reserva_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
