-- CreateEnum
CREATE TYPE "EstadoHabitacion" AS ENUM ('libre', 'ocupada');

-- CreateEnum
CREATE TYPE "EstadoReserva" AS ENUM ('confirmada', 'activa', 'cerrada', 'cancelada');

-- CreateTable
CREATE TABLE "habitacion" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "tarifa_noche" DECIMAL(10,2) NOT NULL,
    "estado" "EstadoHabitacion" NOT NULL DEFAULT 'libre',

    CONSTRAINT "habitacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "huesped" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "documento" TEXT NOT NULL,
    "telefono" TEXT,

    CONSTRAINT "huesped_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reserva" (
    "id" TEXT NOT NULL,
    "habitacion_id" TEXT NOT NULL,
    "huesped_id" TEXT NOT NULL,
    "fecha_entrada" DATE NOT NULL,
    "fecha_salida" DATE NOT NULL,
    "estado" "EstadoReserva" NOT NULL DEFAULT 'confirmada',
    "total" DECIMAL(10,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reserva_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "habitacion_numero_key" ON "habitacion"("numero");

-- AddForeignKey
ALTER TABLE "reserva" ADD CONSTRAINT "reserva_habitacion_id_fkey" FOREIGN KEY ("habitacion_id") REFERENCES "habitacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reserva" ADD CONSTRAINT "reserva_huesped_id_fkey" FOREIGN KEY ("huesped_id") REFERENCES "huesped"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Regla de no-sobreventa: la garantía real contra reservas solapadas.
-- Necesaria para combinar '=' con rangos en la restricción EXCLUDE.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- PostgreSQL rechaza de forma atómica dos reservas que bloquean la misma
-- habitación con fechas solapadas, aunque las peticiones lleguen a la vez.
ALTER TABLE "reserva"
  ADD CONSTRAINT reserva_sin_sobreventa
  EXCLUDE USING gist (
    habitacion_id WITH =,
    daterange(fecha_entrada, fecha_salida, '[)') WITH &&
  )
  WHERE (estado IN ('confirmada', 'activa'));
