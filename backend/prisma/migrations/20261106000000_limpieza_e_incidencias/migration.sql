-- B-4 (plan 15): tareas de limpieza e incidencias, y el rol housekeeping.

-- CreateEnum
CREATE TYPE "TipoTareaLimpieza" AS ENUM ('salida', 'repaso', 'profunda');

-- CreateEnum
CREATE TYPE "EstadoTareaLimpieza" AS ENUM ('pendiente', 'en_proceso', 'terminada');

-- CreateEnum
CREATE TYPE "PrioridadIncidencia" AS ENUM ('baja', 'media', 'alta');

-- CreateEnum
CREATE TYPE "EstadoIncidencia" AS ENUM ('abierta', 'resuelta');

-- AlterEnum
ALTER TYPE "RolUsuario" ADD VALUE 'housekeeping';

-- CreateTable
CREATE TABLE "tarea_limpieza" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "habitacion_id" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "tipo" "TipoTareaLimpieza" NOT NULL,
    "asignada_a_id" TEXT,
    "estado" "EstadoTareaLimpieza" NOT NULL DEFAULT 'pendiente',
    "inicio" TIMESTAMP(3),
    "fin" TIMESTAMP(3),
    "observaciones" TEXT,
    "creada_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tarea_limpieza_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidencia" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "habitacion_id" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "prioridad" "PrioridadIncidencia" NOT NULL,
    "saca_de_servicio" BOOLEAN NOT NULL,
    "estado" "EstadoIncidencia" NOT NULL DEFAULT 'abierta',
    "reportada_por_id" TEXT NOT NULL,
    "creada_en" TIMESTAMP(3) NOT NULL,
    "resuelta_por_id" TEXT,
    "resuelta_en" TIMESTAMP(3),
    "solucion" TEXT,

    CONSTRAINT "incidencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tarea_limpieza_hotel_id_fecha_idx" ON "tarea_limpieza"("hotel_id", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "tarea_limpieza_habitacion_id_fecha_tipo_key" ON "tarea_limpieza"("habitacion_id", "fecha", "tipo");

-- CreateIndex
CREATE INDEX "incidencia_hotel_id_estado_idx" ON "incidencia"("hotel_id", "estado");

-- AddForeignKey
ALTER TABLE "tarea_limpieza" ADD CONSTRAINT "tarea_limpieza_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarea_limpieza" ADD CONSTRAINT "tarea_limpieza_habitacion_id_fkey" FOREIGN KEY ("habitacion_id") REFERENCES "habitacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarea_limpieza" ADD CONSTRAINT "tarea_limpieza_asignada_a_id_fkey" FOREIGN KEY ("asignada_a_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidencia" ADD CONSTRAINT "incidencia_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidencia" ADD CONSTRAINT "incidencia_habitacion_id_fkey" FOREIGN KEY ("habitacion_id") REFERENCES "habitacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidencia" ADD CONSTRAINT "incidencia_reportada_por_id_fkey" FOREIGN KEY ("reportada_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidencia" ADD CONSTRAINT "incidencia_resuelta_por_id_fkey" FOREIGN KEY ("resuelta_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

