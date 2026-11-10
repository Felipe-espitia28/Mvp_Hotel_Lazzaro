import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PERMISOS, PLANTILLAS_DE_ROL, NombrePlantilla } from '../auth/permisos';
import { SELECCION_PERMISOS, permisosDeUsuario } from '../auth/permisos-efectivos';

type Transaccion = Prisma.TransactionClient;

export const MENSAJE_GOBIERNO =
  'El hotel debe conservar al menos una persona activa que pueda gestionar el equipo y los roles.';

// R78 (regla de gobierno): toda operación que pueda dejar al hotel sin quien
// gestione su equipo y sus roles empieza bloqueando la fila del hotel. Así dos
// cambios simultáneos (dos administradores quitándose el permiso el uno al
// otro) se ordenan: el segundo ve el resultado del primero.
export async function bloquearHotel(tx: Transaccion, hotelId: string) {
  await tx.$queryRaw`SELECT id FROM hotel WHERE id = ${hotelId} FOR UPDATE`;
}

// Gobernante = persona activa del hotel con usuarios:gestionar y roles:gestionar efectivos.
export async function contarGobernantes(tx: Transaccion, hotelId: string) {
  const personas = await tx.usuario.findMany({
    where: { hotelId, activo: true, tipo: 'hotel' },
    select: SELECCION_PERMISOS,
  });
  return personas.filter((p) => {
    const permisos = permisosDeUsuario(p);
    return (
      permisos.includes(PERMISOS.USUARIOS_GESTIONAR) && permisos.includes(PERMISOS.ROLES_GESTIONAR)
    );
  }).length;
}

// Se llama al final de la transacción, antes de confirmar: con 0 gobernantes
// el error la revierte y nada cambia.
export async function exigirGobierno(tx: Transaccion, hotelId: string) {
  if ((await contarGobernantes(tx, hotelId)) === 0) {
    throw new ConflictException(MENSAJE_GOBIERNO);
  }
}

// Los roles con que nace un hotel (las plantillas). Devuelve el id de cada uno
// por el nombre de su plantilla.
export async function crearRolesIniciales(tx: Transaccion, hotelId: string) {
  const ids = {} as Record<NombrePlantilla, string>;
  for (const [nombre, plantilla] of Object.entries(PLANTILLAS_DE_ROL) as [
    NombrePlantilla,
    (typeof PLANTILLAS_DE_ROL)[NombrePlantilla],
  ][]) {
    const rol = await tx.rolHotel.create({
      data: {
        hotelId,
        nombre,
        descripcion: plantilla.descripcion,
        permisos: [...plantilla.permisos],
        plantilla: nombre,
      },
      select: { id: true },
    });
    ids[nombre] = rol.id;
  }
  return ids;
}
