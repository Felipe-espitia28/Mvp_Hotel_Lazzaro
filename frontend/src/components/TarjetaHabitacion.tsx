import type { Habitacion } from '../api/types';
import { formatearDinero } from '../formato';

interface Props {
  habitacion: Habitacion;
}

// Tarjeta de habitación: número, tipo, tarifa base de su tipo y estado con color.
export function TarjetaHabitacion({ habitacion }: Props) {
  const { tipoHabitacion: tipo } = habitacion;
  return (
    <div className={`tarjeta-habitacion ${habitacion.estado}`}>
      <div className="numero">{habitacion.numero}</div>
      <div className="tipo">
        {tipo.nombre} · hasta {tipo.capacidadMaxima} huéspedes
      </div>
      <div className="tarifa">desde {formatearDinero(tipo.tarifaBase)} / noche</div>
      <span className={`badge-estado ${habitacion.estado}`}>{habitacion.estado}</span>
    </div>
  );
}
