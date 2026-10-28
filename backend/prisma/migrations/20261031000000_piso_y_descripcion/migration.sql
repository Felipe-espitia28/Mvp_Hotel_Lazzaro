-- A-4: piso y descripción de cada habitación.
ALTER TABLE "habitacion" ADD COLUMN     "descripcion" TEXT,
ADD COLUMN     "piso" INTEGER;

-- El piso de las habitaciones existentes se infiere del número (101 → 1,
-- 1203 → 12), con la misma regla que pisoDelNumero; los números no numéricos
-- o de menos de 3 dígitos quedan sin piso.
UPDATE "habitacion" SET "piso" = "numero"::int / 100 WHERE "numero" ~ '^[0-9]{3,6}$';
