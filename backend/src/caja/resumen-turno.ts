// B-3: cuadre de un turno de caja. Función pura (sin NestJS ni Prisma): el
// resumen siempre se calcula del libro de pagos; al cerrar el turno se guarda
// una copia para que una anulación posterior no cambie un cierre entregado.
//
// Cada anulación afecta a un solo turno:
// - anulada en el mismo turno del pago: el pago no cuenta;
// - anulada en otro turno: el pago sigue en el suyo y aparece como ajuste
//   (con el signo contrario) en el turno donde se anuló;
// - anulada sin turno: el pago sigue en el suyo; la anulación va al aviso.

export type MedioPago = 'efectivo' | 'tarjeta' | 'transferencia' | 'pasarela' | 'otro';

export interface PagoDelTurno {
  tipo: 'abono' | 'anticipo' | 'reembolso';
  medio: MedioPago;
  monto: number;
  turnoId: string | null;
  anulado: boolean;
  anuladoTurnoId: string | null;
}

export interface LineaMedio {
  medio: MedioPago;
  ingresos: number; // abonos y anticipos
  reembolsos: number; // lo devuelto (positivo)
  ajustes: number; // anulaciones de pagos de otros turnos (con signo)
  neto: number; // ingresos − reembolsos + ajustes
}

const pesos = (valor: number) => Math.round(valor * 100) / 100;

// El efecto de un pago en la caja: entra (+) o sale (−).
const conSigno = (p: PagoDelTurno) => (p.tipo === 'reembolso' ? -p.monto : p.monto);

export function resumenTurno(turnoId: string, baseEfectivo: number, pagos: PagoDelTurno[]) {
  const lineas = new Map<MedioPago, LineaMedio>();
  const linea = (medio: MedioPago) => {
    if (!lineas.has(medio)) {
      lineas.set(medio, { medio, ingresos: 0, reembolsos: 0, ajustes: 0, neto: 0 });
    }
    return lineas.get(medio)!;
  };

  for (const p of pagos) {
    const delTurno = p.turnoId === turnoId;
    const anuladoAqui = p.anulado && p.anuladoTurnoId === turnoId;
    if (delTurno && !anuladoAqui) {
      const l = linea(p.medio);
      if (p.tipo === 'reembolso') l.reembolsos += p.monto;
      else l.ingresos += p.monto;
    } else if (!delTurno && anuladoAqui) {
      linea(p.medio).ajustes -= conSigno(p);
    }
  }

  const porMedio = [...lineas.values()]
    .map((l) => ({
      medio: l.medio,
      ingresos: pesos(l.ingresos),
      reembolsos: pesos(l.reembolsos),
      ajustes: pesos(l.ajustes),
      neto: pesos(l.ingresos - l.reembolsos + l.ajustes),
    }))
    .sort((a, b) =>
      a.medio === 'efectivo' ? -1 : b.medio === 'efectivo' ? 1 : a.medio.localeCompare(b.medio),
    );
  const suma = (campo: keyof Omit<LineaMedio, 'medio'>) =>
    pesos(porMedio.reduce((s, l) => s + l[campo], 0));
  const efectivo = porMedio.find((l) => l.medio === 'efectivo')?.neto ?? 0;

  return {
    baseEfectivo: pesos(baseEfectivo),
    porMedio,
    totales: {
      ingresos: suma('ingresos'),
      reembolsos: suma('reembolsos'),
      ajustes: suma('ajustes'),
      neto: suma('neto'),
    },
    // Esperado en efectivo = base + pagos en efectivo − reembolsos en efectivo ± ajustes.
    esperadoEfectivo: pesos(baseEfectivo + efectivo),
  };
}

export type ResumenTurno = ReturnType<typeof resumenTurno>;

// Diferencia = contado − esperado (negativo = falta plata en la caja).
export const diferenciaDeCaja = (contado: number, esperado: number) => pesos(contado - esperado);
