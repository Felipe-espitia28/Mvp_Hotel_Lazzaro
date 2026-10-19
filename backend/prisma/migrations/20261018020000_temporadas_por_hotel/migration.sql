-- R13–R15: cada hotel define sus rangos de temporada alta y media, que se
-- repiten cada año (mes y día como número: 15 de diciembre → 1215).

CREATE TYPE "TipoTemporada" AS ENUM ('alta', 'media');

CREATE TABLE "temporada" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoTemporada" NOT NULL,
    "desde" INTEGER NOT NULL,
    "hasta" INTEGER NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "temporada_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "temporada_hotel_id_idx" ON "temporada"("hotel_id");

ALTER TABLE "temporada" ADD CONSTRAINT "temporada_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Los hoteles que ya existían conservan el calendario que tenían (el sugerido
-- para Colombia): sus precios no cambian con esta migración.
INSERT INTO "temporada" ("id", "hotel_id", "nombre", "tipo", "desde", "hasta")
SELECT gen_random_uuid()::text, h."id", t."nombre", t."tipo"::"TipoTemporada", t."desde", t."hasta"
FROM "hotel" h
CROSS JOIN (
    VALUES
        ('Temporada de fin de año', 'alta', 1215, 115),
        ('Vacaciones de mitad de año', 'alta', 615, 715)
) AS t("nombre", "tipo", "desde", "hasta");
