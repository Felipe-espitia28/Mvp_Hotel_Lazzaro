-- R22: catálogo de consumos de cada hotel. Los cargos guardan de qué producto
-- salieron, pero copian su concepto y valor (cambiar el catálogo no los altera).

CREATE TABLE "producto_consumo" (
    "id" TEXT NOT NULL,
    "hotel_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "categoria" "CategoriaCargo" NOT NULL,
    "precio" DECIMAL(10,2) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "producto_consumo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "producto_consumo_hotel_id_nombre_key" ON "producto_consumo"("hotel_id", "nombre");

ALTER TABLE "producto_consumo" ADD CONSTRAINT "producto_consumo_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cargo" ADD COLUMN "producto_id" TEXT;

ALTER TABLE "cargo" ADD CONSTRAINT "cargo_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "producto_consumo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Catálogo de partida para los hoteles existentes (lo ajustan en su Gerencia).
INSERT INTO "producto_consumo" ("id", "hotel_id", "nombre", "categoria", "precio")
SELECT gen_random_uuid()::text, h."id", p."nombre", p."categoria"::"CategoriaCargo", p."precio"
FROM "hotel" h
CROSS JOIN (
    VALUES
        ('Agua 600 ml', 'minibar', 6000),
        ('Gaseosa', 'minibar', 5000),
        ('Cerveza nacional', 'minibar', 9000),
        ('Snack', 'minibar', 7000),
        ('Lavado de camisas', 'lavanderia', 25000),
        ('Lavado de pantalón', 'lavanderia', 30000),
        ('Desayuno adicional', 'restaurante', 25000),
        ('Late check-out (hasta las 3 p. m.)', 'late_checkout', 50000)
) AS p("nombre", "categoria", "precio");
