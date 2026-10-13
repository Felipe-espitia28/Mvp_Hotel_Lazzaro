// Ocupación por noche para el gráfico del panel (sin React, para probarla).
import { diasEntre, sumarDias } from './calendario';

export interface NocheOcupacion {
  fecha: string; // YYYY-MM-DD
  ocupadas: number;
  total: number; // habitaciones en servicio
  porcentaje: number; // 0–100, redondeado
}

interface HabitacionMin {
  id: string;
  estado: string;
}

interface ReservaMin {
  habitacionId: string;
  fechaEntrada: string;
  fechaSalida: string;
  estado: string;
}

// Para cada noche de [desde, desde + dias): reservas vigentes (confirmadas o
// activas) que la ocupan, sobre las habitaciones en servicio. La noche del día D
// está ocupada si entrada <= D < salida (el día de salida queda libre).
export function ocupacionPorNoche(
  habitaciones: HabitacionMin[],
  reservas: ReservaMin[],
  desde: string,
  dias: number,
): NocheOcupacion[] {
  const enServicio = new Set(
    habitaciones.filter((h) => h.estado !== 'fuera_servicio').map((h) => h.id),
  );
  const vigentes = reservas.filter(
    (r) => (r.estado === 'confirmada' || r.estado === 'activa') && enServicio.has(r.habitacionId),
  );
  const total = enServicio.size;

  return Array.from({ length: dias }, (_, i) => {
    const fecha = sumarDias(desde, i);
    const ocupadas = vigentes.filter(
      (r) =>
        diasEntre(r.fechaEntrada.slice(0, 10), fecha) >= 0 &&
        diasEntre(fecha, r.fechaSalida.slice(0, 10)) > 0,
    ).length;
    return {
      fecha,
      ocupadas,
      total,
      porcentaje: total ? Math.round((ocupadas / total) * 100) : 0,
    };
  });
}
