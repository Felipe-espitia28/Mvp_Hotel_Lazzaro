-- Plan 19: roles y permisos personalizados por hotel. Cada hotel recibe los
-- roles de las plantillas (Administrador, Recepción, Camarera) y cada usuario
-- queda con el que corresponde a su rol fijo anterior: nadie gana ni pierde
-- permisos (el Administrador gana solo el nuevo roles:gestionar).

-- CreateEnum
CREATE TYPE "TipoUsuario" AS ENUM ('plataforma', 'hotel');

-- CreateEnum
CREATE TYPE "TipoEventoRol" AS ENUM ('creado', 'editado', 'eliminado');

-- AlterEnum
ALTER TYPE "TipoEventoUsuario" ADD VALUE 'rol_cambiado';
ALTER TYPE "TipoEventoUsuario" ADD VALUE 'permisos_ajustados';

-- AlterTable
ALTER TABLE "evento_usuario" ADD COLUMN     "detalle" JSONB;

-- CreateTable
CREATE TABLE "rol_hotel" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "permisos" TEXT[],
    "plantilla" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rol_hotel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evento_rol" (
    "id" TEXT NOT NULL,
    "rol_id" TEXT,
    "hotel_id" TEXT NOT NULL,
    "actor_id" TEXT,
    "tipo" "TipoEventoRol" NOT NULL,
    "detalle" JSONB NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evento_rol_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rol_hotel_hotel_id_idx" ON "rol_hotel"("hotel_id");

-- CreateIndex
CREATE UNIQUE INDEX "rol_hotel_id_hotel_id_key" ON "rol_hotel"("id", "hotel_id");

-- El nombre de un rol es único en su hotel sin importar mayúsculas.
CREATE UNIQUE INDEX "rol_hotel_nombre_unico" ON "rol_hotel"("hotel_id", lower("nombre"));

-- CreateIndex
CREATE INDEX "evento_rol_hotel_id_idx" ON "evento_rol"("hotel_id");

-- Los roles de las plantillas en cada hotel (backend/src/auth/permisos.ts).
INSERT INTO "rol_hotel" ("id", "hotel_id", "nombre", "descripcion", "permisos", "plantilla", "updated_at")
SELECT gen_random_uuid()::text, h."id", p."nombre", p."descripcion", p."permisos", p."nombre", CURRENT_TIMESTAMP
FROM "hotel" h
CROSS JOIN (VALUES
  ('Administrador',
   'Maneja la Gerencia del hotel: configuración, equipo, roles y dinero.',
   ARRAY['habitaciones:ver','habitaciones:estado','habitaciones:gestionar','reservas:ver',
         'reservas:gestionar','estadias:gestionar','no-shows:procesar','folio:gestionar',
         'pagos:anular','cuentas:por-cobrar','caja:turno','caja:supervisar','agenda:gestionar',
         'limpieza:gestionar','limpieza:asignar','reportes-legales:ver','panel:gerencia',
         'hotel:configurar','pagos:configurar','usuarios:gestionar','roles:gestionar']::TEXT[]),
  ('Recepción',
   'Opera el día a día: reservas, check-in y check-out, folio y caja.',
   ARRAY['habitaciones:ver','habitaciones:estado','reservas:ver','reservas:gestionar',
         'estadias:gestionar','folio:gestionar','no-shows:procesar','reportes-legales:ver',
         'agenda:gestionar','caja:turno','limpieza:gestionar','limpieza:asignar']::TEXT[]),
  ('Camarera',
   'Ve las habitaciones y hace sus tareas de limpieza.',
   ARRAY['habitaciones:ver','limpieza:gestionar']::TEXT[])
) AS p("nombre", "descripcion", "permisos");

-- Cada usuario con el rol de su hotel que corresponde al anterior.
ALTER TABLE "usuario" ADD COLUMN     "permisos_agregados" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "permisos_quitados" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "rol_id" TEXT,
ADD COLUMN     "tipo" "TipoUsuario";

UPDATE "usuario" u SET "tipo" = 'plataforma' WHERE u."rol" = 'plataforma';

UPDATE "usuario" u SET "tipo" = 'hotel', "rol_id" = r."id"
FROM "rol_hotel" r
WHERE u."rol" <> 'plataforma'
  AND r."hotel_id" = u."hotel_id"
  AND r."nombre" = CASE u."rol"
    WHEN 'admin' THEN 'Administrador'
    WHEN 'recepcionista' THEN 'Recepción'
    WHEN 'housekeeping' THEN 'Camarera'
  END;

ALTER TABLE "usuario" ALTER COLUMN "tipo" SET NOT NULL;
ALTER TABLE "usuario" DROP COLUMN "rol";

-- DropEnum
DROP TYPE "RolUsuario";

-- Un usuario de la plataforma no tiene hotel ni rol; uno de hotel tiene los dos
-- (y su rol es de su hotel: la llave compuesta de abajo).
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_tipo_hotel_rol" CHECK (
  ("tipo" = 'plataforma' AND "rol_id" IS NULL AND "hotel_id" IS NULL)
  OR ("tipo" = 'hotel' AND "rol_id" IS NOT NULL AND "hotel_id" IS NOT NULL)
);

-- AddForeignKey
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_rol_id_hotel_id_fkey" FOREIGN KEY ("rol_id", "hotel_id") REFERENCES "rol_hotel"("id", "hotel_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rol_hotel" ADD CONSTRAINT "rol_hotel_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_rol" ADD CONSTRAINT "evento_rol_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "rol_hotel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_rol" ADD CONSTRAINT "evento_rol_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_rol" ADD CONSTRAINT "evento_rol_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
