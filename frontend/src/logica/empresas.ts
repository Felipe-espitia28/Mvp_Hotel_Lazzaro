// B-5: cuentas empresa en pantalla (sin React, para probarlas).

// "900123456" + "8" → "900.123.456-8".
export function formatearNit(nit: string, digitoVerificacion?: string) {
  const conPuntos = nit.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return digitoVerificacion ? `${conPuntos}-${digitoVerificacion}` : conPuntos;
}

// Reparte un abono entre las reservas, de la más antigua a la más reciente,
// hasta agotarlo (lo que recepción propone; puede ajustarlo a mano).
export function repartirAbono(
  total: number,
  reservas: { reservaId: string; saldo: number; fechaSalida: string }[],
) {
  let queda = Math.max(0, total);
  const reparto: Record<string, number> = {};
  for (const r of [...reservas].sort((a, b) => a.fechaSalida.localeCompare(b.fechaSalida))) {
    if (r.saldo <= 0) continue;
    const monto = Math.min(queda, r.saldo);
    if (monto > 0) reparto[r.reservaId] = Math.round(monto * 100) / 100;
    queda -= monto;
  }
  return reparto;
}

// Las reservas con algo en el reparto y su suma (lo que se envía al backend).
export function lineasDelAbono(reparto: Record<string, number>) {
  const pagos = Object.entries(reparto)
    .filter(([, monto]) => monto > 0)
    .map(([reservaId, monto]) => ({ reservaId, monto }));
  return { pagos, total: pagos.reduce((s, p) => s + p.monto, 0) };
}

// Las cuentas por cobrar agrupadas por quién paga: primero los huéspedes y
// luego cada empresa, con su total.
export function agruparPorPagador<
  T extends { saldo: number; empresa: { id: string; razonSocial: string } | null },
>(cuentas: T[]) {
  const grupos = new Map<string, { titulo: string; empresaId: string | null; cuentas: T[] }>();
  for (const c of cuentas) {
    const clave = c.empresa?.id ?? '';
    const grupo = grupos.get(clave) ?? {
      titulo: c.empresa?.razonSocial ?? 'Huéspedes',
      empresaId: c.empresa?.id ?? null,
      cuentas: [],
    };
    grupo.cuentas.push(c);
    grupos.set(clave, grupo);
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, total: g.cuentas.reduce((s, c) => s + c.saldo, 0) }))
    .sort((a, b) =>
      a.empresaId === null ? -1 : b.empresaId === null ? 1 : a.titulo.localeCompare(b.titulo),
    );
}
