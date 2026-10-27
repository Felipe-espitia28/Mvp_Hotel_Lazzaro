-- CreateTable
CREATE TABLE "pago" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "reserva_id" TEXT NOT NULL,
    "tipo" "TipoPago" NOT NULL,
    "medio" "MedioPago" NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "referencia" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_id" TEXT,
    "anulado" BOOLEAN NOT NULL DEFAULT false,
    "motivo_anulacion" TEXT,
    "anulado_por_id" TEXT,

    CONSTRAINT "pago_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pago_reserva_id_idx" ON "pago"("reserva_id");

-- CreateIndex
CREATE INDEX "pago_hotel_id_fecha_idx" ON "pago"("hotel_id", "fecha");

-- AddForeignKey
ALTER TABLE "pago" ADD CONSTRAINT "pago_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pago" ADD CONSTRAINT "pago_reserva_id_fkey" FOREIGN KEY ("reserva_id") REFERENCES "reserva"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pago" ADD CONSTRAINT "pago_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pago" ADD CONSTRAINT "pago_anulado_por_id_fkey" FOREIGN KEY ("anulado_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Un pago mueve dinero: su monto siempre es positivo (el tipo dice si entra o sale).
ALTER TABLE "pago" ADD CONSTRAINT "pago_monto_positivo" CHECK ("monto" > 0);

-- Datos existentes (no se borran): lo cobrado antes del libro de pagos queda
-- como pagos, para que el saldo y los reportes cuadren.
-- 1. Cada estadía cerrada se pagó completa en el check-out, con su medio.
INSERT INTO "pago" ("id", "hotel_id", "reserva_id", "tipo", "medio", "monto", "referencia", "fecha", "usuario_id")
SELECT gen_random_uuid()::text, r."hotel_id", r."id", 'abono', COALESCE(r."medio_pago", 'otro'), r."total",
       'Migración', COALESCE(e."fecha", r."fecha_salida"::timestamp), e."usuario_id"
FROM "reserva" r
LEFT JOIN LATERAL (
  SELECT "fecha", "usuario_id" FROM "evento_reserva"
  WHERE "reserva_id" = r."id" AND "tipo" = 'check_out'
  ORDER BY "fecha" DESC LIMIT 1
) e ON true
WHERE r."estado" = 'cerrada' AND r."total" > 0;

-- 2. Las penalidades antiguas (cancelación tardía y no-show) se dan por
--    pagadas: el panel ya las contaba como ingreso. El medio no se registraba.
INSERT INTO "pago" ("id", "hotel_id", "reserva_id", "tipo", "medio", "monto", "referencia", "fecha", "usuario_id")
SELECT gen_random_uuid()::text, r."hotel_id", r."id", 'abono', 'otro', r."total",
       'Migración', COALESCE(e."fecha", r."created_at"), e."usuario_id"
FROM "reserva" r
LEFT JOIN LATERAL (
  SELECT "fecha", "usuario_id" FROM "evento_reserva"
  WHERE "reserva_id" = r."id" AND "tipo" IN ('cancelada', 'no_show')
  ORDER BY "fecha" DESC LIMIT 1
) e ON true
WHERE r."estado" IN ('cancelada', 'no_show') AND r."total" > 0;

-- El medio de pago ahora está en cada pago.
ALTER TABLE "reserva" DROP COLUMN "medio_pago";
