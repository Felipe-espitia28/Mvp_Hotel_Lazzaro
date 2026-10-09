import type { Habitacion } from '../api/types';

interface Props {
  habitacion: Habitacion;
}

// Tarjeta simple de habitación: número, tipo, tarifa y estado con color.
export function TarjetaHabitacion({ habitacion }: Props) {
  return (
    <div className={`tarjeta-habitacion ${habitacion.estado}`}>
      <div className="numero">{habitacion.numero}</div>
      <div className="tipo">{habitacion.tipo}</div>
      <div className="tarifa">
        ${Number(habitacion.tarifaNoche).toLocaleString('es-CO')} / noche
      </div>
      <span className={`badge-estado ${habitacion.estado}`}>{habitacion.estado}</span>
    </div>
  );
}
