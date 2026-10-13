import type { Habitacion } from '../api/types';
import { ETIQUETA_ESTADO_HABITACION, formatearDinero } from '../formato';

interface Props {
  habitacion: Habitacion;
  // Recepción y admin cambian el estado (R25, R26); undefined = solo lectura.
  onCambiarEstado?: (estado: 'libre' | 'fuera_servicio') => void;
  procesando?: boolean;
}

// Tarjeta de habitación: número, tipo, tarifa base, estado y acciones de estado.
export function TarjetaHabitacion({ habitacion, onCambiarEstado, procesando }: Props) {
  const { tipoHabitacion: tipo, estado } = habitacion;
  return (
    <div className={`tarjeta-habitacion ${estado}`}>
      <div className="numero">{habitacion.numero}</div>
      <div className="tipo">
        {tipo.nombre} · hasta {tipo.capacidadMaxima} huéspedes
      </div>
      <div className="tarifa">desde {formatearDinero(tipo.tarifaBase)} / noche</div>
      <span className={`badge-estado ${estado}`}>{ETIQUETA_ESTADO_HABITACION[estado]}</span>
      {onCambiarEstado && (
        <div className="acciones-tarjeta">
          {estado === 'en_limpieza' && (
            <button
              className="primario"
              disabled={procesando}
              onClick={() => onCambiarEstado('libre')}
            >
              Marcar lista
            </button>
          )}
          {(estado === 'libre' || estado === 'en_limpieza') && (
            <button
              className="enlace"
              disabled={procesando}
              onClick={() => onCambiarEstado('fuera_servicio')}
            >
              Fuera de servicio
            </button>
          )}
          {estado === 'fuera_servicio' && (
            <button
              className="secundario"
              disabled={procesando}
              onClick={() => onCambiarEstado('libre')}
            >
              Volver a servicio
            </button>
          )}
        </div>
      )}
    </div>
  );
}
