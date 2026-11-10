-- Plan 18: credenciales por correo, contraseña temporal y recuperación. Los
-- usuarios existentes conservan su contraseña (no deben cambiarla).

-- CreateEnum
CREATE TYPE "TipoEventoUsuario" AS ENUM ('creado', 'credenciales_enviadas', 'contrasena_cambiada', 'recuperacion_solicitada', 'contrasena_restablecida', 'desactivado');

-- CreateEnum
CREATE TYPE "EstadoCorreo" AS ENUM ('enviado', 'fallido');

-- AlterTable
ALTER TABLE "usuario" ADD COLUMN     "contrasena_cambiada_en" TIMESTAMP(3),
ADD COLUMN     "contrasena_temporal_vence_en" TIMESTAMP(3),
ADD COLUMN     "debe_cambiar_contrasena" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "version_sesion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "token_recuperacion" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "hash_token" TEXT NOT NULL,
    "vence_en" TIMESTAMP(3) NOT NULL,
    "usado_en" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_recuperacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evento_usuario" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "actor_id" TEXT,
    "tipo" "TipoEventoUsuario" NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evento_usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "correo_enviado" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT,
    "usuario_id" TEXT,
    "plantilla" TEXT NOT NULL,
    "destinatario" TEXT NOT NULL,
    "estado" "EstadoCorreo" NOT NULL,
    "id_mensaje" TEXT,
    "error" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "correo_enviado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "token_recuperacion_hash_token_key" ON "token_recuperacion"("hash_token");

-- CreateIndex
CREATE INDEX "token_recuperacion_usuario_id_idx" ON "token_recuperacion"("usuario_id");

-- CreateIndex
CREATE INDEX "evento_usuario_usuario_id_idx" ON "evento_usuario"("usuario_id");

-- CreateIndex
CREATE INDEX "correo_enviado_usuario_id_idx" ON "correo_enviado"("usuario_id");

-- AddForeignKey
ALTER TABLE "token_recuperacion" ADD CONSTRAINT "token_recuperacion_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_usuario" ADD CONSTRAINT "evento_usuario_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_usuario" ADD CONSTRAINT "evento_usuario_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correo_enviado" ADD CONSTRAINT "correo_enviado_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correo_enviado" ADD CONSTRAINT "correo_enviado_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

