import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import { cpSync, mkdtempSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const BACKEND = join(__dirname, '..');
const MIGRACIONES = join(BACKEND, 'prisma', 'migrations');

// Prueba que una migración convierte los datos existentes (no los borra). Se
// hace sobre una base propia, con nombre único, que se crea y se borra aquí:
// se aplican las migraciones anteriores a `migracion`, se insertan datos
// "antiguos" (`datosAntiguos`, SQL), se aplica esa migración y las siguientes,
// y `comprobar` consulta el resultado.
export async function probarMigracion(
  migracion: string,
  datosAntiguos: string[],
  comprobar: (cliente: PrismaClient) => Promise<void>,
) {
  const base = `mvp_hotel_migracion_${Date.now()}_test`;
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `/${base}`;
  const env = { ...process.env, DATABASE_URL: url.toString() };
  // Conexión a la base de pruebas, solo para crear y borrar la de esta prueba.
  const administrador = new PrismaClient();
  let cliente: PrismaClient | undefined;

  const carpeta = mkdtempSync(join(tmpdir(), 'migracion-'));
  cpSync(join(BACKEND, 'prisma', 'schema.prisma'), join(carpeta, 'schema.prisma'));
  const copiar = (incluir: (nombre: string) => boolean) => {
    for (const nombre of readdirSync(MIGRACIONES).filter(incluir)) {
      cpSync(join(MIGRACIONES, nombre), join(carpeta, 'migrations', nombre), { recursive: true });
    }
  };
  const desplegar = () =>
    execSync(`npx prisma migrate deploy --schema "${join(carpeta, 'schema.prisma')}"`, {
      cwd: BACKEND,
      env,
      stdio: 'pipe',
    });

  try {
    await administrador.$executeRawUnsafe(`CREATE DATABASE "${base}"`);
    // Las carpetas de migración empiezan con su fecha: el orden del nombre es el de aplicación.
    copiar((nombre) => nombre !== 'migration_lock.toml' && nombre < migracion);
    desplegar();

    cliente = new PrismaClient({ datasourceUrl: url.toString() });
    for (const sql of datosAntiguos) {
      await cliente.$executeRawUnsafe(sql);
    }

    copiar((nombre) => nombre !== 'migration_lock.toml' && nombre >= migracion);
    desplegar();
    await comprobar(cliente);
  } finally {
    await cliente?.$disconnect();
    await administrador.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${base}"`);
    await administrador.$disconnect();
  }
}

// Un hotel con una habitación doble; el huésped y la reserva se agregan en
// cada prueba, con las columnas que tenían antes de su migración.
export const HOTEL_ANTIGUO = [
  `INSERT INTO hotel (id, slug, nombre) VALUES ('h1', 'antiguo', 'Hotel Antiguo')`,
  `INSERT INTO tipo_habitacion (id, hotel_id, codigo, nombre, tarifa_base, capacidad_incluida, capacidad_maxima, cargo_persona_adicional)
   VALUES ('t1', 'h1', 'doble', 'Doble', 100000, 2, 3, 30001)`,
  `INSERT INTO habitacion (id, hotel_id, numero, tipo_habitacion_id) VALUES ('c1', 'h1', '101', 't1')`,
];
