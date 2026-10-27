-- CreateEnum
CREATE TYPE "Parentesco" AS ENUM ('padre_madre', 'familiar', 'tutor_legal', 'tercero_autorizado');

-- AlterEnum
ALTER TYPE "TipoDocumento" ADD VALUE 'RC';
ALTER TYPE "TipoDocumento" ADD VALUE 'PEP';

-- AlterTable
ALTER TABLE "hotel" ADD COLUMN     "tipo_alojamiento" TEXT NOT NULL DEFAULT 'Hotel';

-- AlterTable
ALTER TABLE "huesped" ADD COLUMN     "ciudad_residencia" TEXT,
ADD COLUMN     "datos_completos" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "fecha_nacimiento" DATE,
ADD COLUMN     "pais_residencia" TEXT,
ADD COLUMN     "primer_apellido" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "primer_nombre" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "segundo_apellido" TEXT,
ADD COLUMN     "segundo_nombre" TEXT;

-- CreateTable
CREATE TABLE "ocupante" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "reserva_id" TEXT NOT NULL,
    "huesped_id" TEXT NOT NULL,
    "titular" BOOLEAN NOT NULL DEFAULT false,
    "pais_procedencia" TEXT,
    "ciudad_procedencia" TEXT,
    "parentesco" "Parentesco",
    "responsable_id" TEXT,
    "autorizacion_verificada_por_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ocupante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "politica_datos" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "texto" TEXT NOT NULL,
    "vigente_desde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "politica_datos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aceptacion_datos" (
    "id" TEXT NOT NULL,
    "huesped_id" TEXT NOT NULL,
    "politica_id" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_id" TEXT NOT NULL,

    CONSTRAINT "aceptacion_datos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ocupante_hotel_id_idx" ON "ocupante"("hotel_id");

-- CreateIndex
CREATE UNIQUE INDEX "ocupante_reserva_id_huesped_id_key" ON "ocupante"("reserva_id", "huesped_id");

-- CreateIndex
CREATE UNIQUE INDEX "politica_datos_hotel_id_version_key" ON "politica_datos"("hotel_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "aceptacion_datos_huesped_id_politica_id_key" ON "aceptacion_datos"("huesped_id", "politica_id");

-- AddForeignKey
ALTER TABLE "ocupante" ADD CONSTRAINT "ocupante_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocupante" ADD CONSTRAINT "ocupante_reserva_id_fkey" FOREIGN KEY ("reserva_id") REFERENCES "reserva"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocupante" ADD CONSTRAINT "ocupante_huesped_id_fkey" FOREIGN KEY ("huesped_id") REFERENCES "huesped"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocupante" ADD CONSTRAINT "ocupante_responsable_id_fkey" FOREIGN KEY ("responsable_id") REFERENCES "ocupante"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocupante" ADD CONSTRAINT "ocupante_autorizacion_verificada_por_id_fkey" FOREIGN KEY ("autorizacion_verificada_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "politica_datos" ADD CONSTRAINT "politica_datos_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aceptacion_datos" ADD CONSTRAINT "aceptacion_datos_huesped_id_fkey" FOREIGN KEY ("huesped_id") REFERENCES "huesped"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aceptacion_datos" ADD CONSTRAINT "aceptacion_datos_politica_id_fkey" FOREIGN KEY ("politica_id") REFERENCES "politica_datos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aceptacion_datos" ADD CONSTRAINT "aceptacion_datos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Datos existentes (no se borran): el nombre completo actual pasa a
-- primer_nombre y el apellido queda por completar (datos_completos = false);
-- recepción separa los nombres en el próximo check-in.
UPDATE "huesped" SET "primer_nombre" = "nombre";
ALTER TABLE "huesped" ALTER COLUMN "primer_nombre" DROP DEFAULT;

-- Cada reserva existente queda con su titular como único ocupante; la
-- procedencia, que era de la reserva, pasa a ser del ocupante.
INSERT INTO "ocupante" ("id", "hotel_id", "reserva_id", "huesped_id", "titular", "ciudad_procedencia", "created_at")
SELECT gen_random_uuid()::text, "hotel_id", "id", "huesped_id", true, "procedencia", "created_at"
FROM "reserva";

ALTER TABLE "reserva" DROP COLUMN "procedencia";

-- Un solo titular por reserva, garantizado por PostgreSQL (Prisma no modela
-- índices parciales).
CREATE UNIQUE INDEX "ocupante_un_titular" ON "ocupante" ("reserva_id") WHERE "titular";
