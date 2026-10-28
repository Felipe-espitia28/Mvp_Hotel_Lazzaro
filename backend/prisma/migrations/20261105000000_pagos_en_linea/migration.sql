-- B-2 (plan 14): pagos en línea (pasarela simulada y Wompi). El Pago solo
-- existe cuando llega el evento firmado; el intento guarda la referencia.

-- CreateEnum
CREATE TYPE "EstadoIntentoPago" AS ENUM ('creado', 'aprobado', 'rechazado', 'expirado');

-- CreateEnum
CREATE TYPE "ProveedorPasarela" AS ENUM ('simulada', 'wompi');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoEventoReserva" ADD VALUE 'link_de_pago';
ALTER TYPE "TipoEventoReserva" ADD VALUE 'alerta_pago_en_linea';

-- CreateTable
CREATE TABLE "intento_pago" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "reserva_id" TEXT NOT NULL,
    "referencia" TEXT NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "proveedor" "ProveedorPasarela" NOT NULL,
    "estado" "EstadoIntentoPago" NOT NULL DEFAULT 'creado',
    "url" TEXT NOT NULL,
    "expira_en" TIMESTAMP(3) NOT NULL,
    "id_transaccion_proveedor" TEXT,
    "pago_id" TEXT,
    "alerta" TEXT,
    "usuario_id" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "intento_pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracion_pasarela" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "ambiente" TEXT NOT NULL,
    "llave_publica" TEXT NOT NULL,
    "llave_privada" TEXT NOT NULL,
    "secreto_eventos" TEXT NOT NULL,
    "secreto_integridad" TEXT NOT NULL,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracion_pasarela_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "intento_pago_referencia_key" ON "intento_pago"("referencia");

-- CreateIndex
CREATE UNIQUE INDEX "intento_pago_id_transaccion_proveedor_key" ON "intento_pago"("id_transaccion_proveedor");

-- CreateIndex
CREATE UNIQUE INDEX "intento_pago_pago_id_key" ON "intento_pago"("pago_id");

-- CreateIndex
CREATE INDEX "intento_pago_hotel_id_estado_idx" ON "intento_pago"("hotel_id", "estado");

-- CreateIndex
CREATE INDEX "intento_pago_reserva_id_idx" ON "intento_pago"("reserva_id");

-- CreateIndex
CREATE UNIQUE INDEX "configuracion_pasarela_hotel_id_key" ON "configuracion_pasarela"("hotel_id");

-- AddForeignKey
ALTER TABLE "intento_pago" ADD CONSTRAINT "intento_pago_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intento_pago" ADD CONSTRAINT "intento_pago_reserva_id_fkey" FOREIGN KEY ("reserva_id") REFERENCES "reserva"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intento_pago" ADD CONSTRAINT "intento_pago_pago_id_fkey" FOREIGN KEY ("pago_id") REFERENCES "pago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intento_pago" ADD CONSTRAINT "intento_pago_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuracion_pasarela" ADD CONSTRAINT "configuracion_pasarela_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- El monto del link lo fija el servidor y siempre es positivo.
ALTER TABLE "intento_pago" ADD CONSTRAINT "intento_pago_monto_positivo" CHECK ("monto" > 0);
