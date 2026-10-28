-- S-2 (plan 12): agenda de las citas del spa y cupos de las experiencias.
-- Los pagos pueden ser de una cita o de un cupo (de quien no tiene una estadia
-- activa a la cual cargarlos); los pagos existentes conservan su reserva.

-- CreateEnum
CREATE TYPE "EstadoCita" AS ENUM ('agendada', 'en_curso', 'realizada', 'cancelada', 'no_asistio');

-- CreateEnum
CREATE TYPE "EstadoSalida" AS ENUM ('programada', 'realizada', 'cancelada');

-- CreateEnum
CREATE TYPE "EstadoCupo" AS ENUM ('vigente', 'cancelado');

-- AlterTable
ALTER TABLE "pago" ADD COLUMN     "cita_id" TEXT,
ADD COLUMN     "cupo_id" TEXT,
ALTER COLUMN "reserva_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "recurso_servicio" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recurso_servicio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurso_de_servicio" (
    "recurso_id" TEXT NOT NULL,
    "servicio_id" TEXT NOT NULL,

    CONSTRAINT "recurso_de_servicio_pkey" PRIMARY KEY ("recurso_id","servicio_id")
);

-- CreateTable
CREATE TABLE "cita_servicio" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "servicio_id" TEXT NOT NULL,
    "recurso_id" TEXT NOT NULL,
    "reserva_id" TEXT,
    "huesped_id" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fin" TIMESTAMP(3) NOT NULL,
    "fin_ocupado" TIMESTAMP(3) NOT NULL,
    "cantidad" INTEGER NOT NULL DEFAULT 1,
    "adultos" INTEGER NOT NULL DEFAULT 0,
    "edades_ninos" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "valor" DECIMAL(10,2) NOT NULL,
    "concepto" TEXT NOT NULL,
    "estado" "EstadoCita" NOT NULL DEFAULT 'agendada',
    "cargo_id" TEXT,
    "usuario_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cita_servicio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salida_experiencia" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "servicio_id" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "cupos" INTEGER NOT NULL,
    "estado" "EstadoSalida" NOT NULL DEFAULT 'programada',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salida_experiencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cupo_experiencia" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "salida_id" TEXT NOT NULL,
    "reserva_id" TEXT,
    "huesped_id" TEXT NOT NULL,
    "personas" INTEGER NOT NULL,
    "adultos" INTEGER NOT NULL DEFAULT 0,
    "edades_ninos" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "valor" DECIMAL(10,2) NOT NULL,
    "concepto" TEXT NOT NULL,
    "estado" "EstadoCupo" NOT NULL DEFAULT 'vigente',
    "cargo_id" TEXT,
    "usuario_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cupo_experiencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recurso_servicio_hotel_id_nombre_key" ON "recurso_servicio"("hotel_id", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "cita_servicio_cargo_id_key" ON "cita_servicio"("cargo_id");

-- CreateIndex
CREATE INDEX "cita_servicio_hotel_id_inicio_idx" ON "cita_servicio"("hotel_id", "inicio");

-- CreateIndex
CREATE INDEX "cita_servicio_reserva_id_idx" ON "cita_servicio"("reserva_id");

-- CreateIndex
CREATE INDEX "salida_experiencia_hotel_id_inicio_idx" ON "salida_experiencia"("hotel_id", "inicio");

-- CreateIndex
CREATE UNIQUE INDEX "cupo_experiencia_cargo_id_key" ON "cupo_experiencia"("cargo_id");

-- CreateIndex
CREATE INDEX "cupo_experiencia_salida_id_idx" ON "cupo_experiencia"("salida_id");

-- CreateIndex
CREATE INDEX "cupo_experiencia_reserva_id_idx" ON "cupo_experiencia"("reserva_id");

-- AddForeignKey
ALTER TABLE "pago" ADD CONSTRAINT "pago_cita_id_fkey" FOREIGN KEY ("cita_id") REFERENCES "cita_servicio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pago" ADD CONSTRAINT "pago_cupo_id_fkey" FOREIGN KEY ("cupo_id") REFERENCES "cupo_experiencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurso_servicio" ADD CONSTRAINT "recurso_servicio_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurso_de_servicio" ADD CONSTRAINT "recurso_de_servicio_recurso_id_fkey" FOREIGN KEY ("recurso_id") REFERENCES "recurso_servicio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurso_de_servicio" ADD CONSTRAINT "recurso_de_servicio_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "servicio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cita_servicio" ADD CONSTRAINT "cita_servicio_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cita_servicio" ADD CONSTRAINT "cita_servicio_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "servicio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cita_servicio" ADD CONSTRAINT "cita_servicio_recurso_id_fkey" FOREIGN KEY ("recurso_id") REFERENCES "recurso_servicio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cita_servicio" ADD CONSTRAINT "cita_servicio_reserva_id_fkey" FOREIGN KEY ("reserva_id") REFERENCES "reserva"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cita_servicio" ADD CONSTRAINT "cita_servicio_huesped_id_fkey" FOREIGN KEY ("huesped_id") REFERENCES "huesped"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cita_servicio" ADD CONSTRAINT "cita_servicio_cargo_id_fkey" FOREIGN KEY ("cargo_id") REFERENCES "cargo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cita_servicio" ADD CONSTRAINT "cita_servicio_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salida_experiencia" ADD CONSTRAINT "salida_experiencia_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salida_experiencia" ADD CONSTRAINT "salida_experiencia_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "servicio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cupo_experiencia" ADD CONSTRAINT "cupo_experiencia_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cupo_experiencia" ADD CONSTRAINT "cupo_experiencia_salida_id_fkey" FOREIGN KEY ("salida_id") REFERENCES "salida_experiencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cupo_experiencia" ADD CONSTRAINT "cupo_experiencia_reserva_id_fkey" FOREIGN KEY ("reserva_id") REFERENCES "reserva"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cupo_experiencia" ADD CONSTRAINT "cupo_experiencia_huesped_id_fkey" FOREIGN KEY ("huesped_id") REFERENCES "huesped"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cupo_experiencia" ADD CONSTRAINT "cupo_experiencia_cargo_id_fkey" FOREIGN KEY ("cargo_id") REFERENCES "cargo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cupo_experiencia" ADD CONSTRAINT "cupo_experiencia_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Un pago es de exactamente una cosa: una reserva, una cita o un cupo.
ALTER TABLE "pago"
  ADD CONSTRAINT pago_de_una_cosa CHECK (num_nonnulls(reserva_id, cita_id, cupo_id) = 1);

-- Un recurso no tiene dos citas vigentes cruzadas: la misma garantia que la
-- no-sobreventa de las habitaciones (btree_gist ya existe desde el init). Las
-- fechas se guardan en UTC sin zona (TIMESTAMP de Prisma), por eso tsrange.
ALTER TABLE "cita_servicio"
  ADD CONSTRAINT cita_sin_cruce
  EXCLUDE USING gist (
    recurso_id WITH =,
    tsrange(inicio, fin_ocupado, '[)') WITH &&
  )
  WHERE (estado IN ('agendada', 'en_curso'));

ALTER TABLE "cita_servicio"
  ADD CONSTRAINT cita_fin_despues_de_inicio CHECK (inicio < fin AND fin <= fin_ocupado);

ALTER TABLE "salida_experiencia"
  ADD CONSTRAINT salida_con_cupos CHECK (cupos > 0);

ALTER TABLE "cupo_experiencia"
  ADD CONSTRAINT cupo_con_personas CHECK (personas > 0);
