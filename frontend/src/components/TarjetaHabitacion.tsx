import {
  Bed,
  BedDouble,
  CheckCircle2,
  Crown,
  RotateCcw,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { Habitacion } from '../api/types';
import { ETIQUETA_ESTADO_HABITACION, formatearDinero } from '../formato';

interface Props {
  habitacion: Habitacion;
  // Recepción y admin cambian el estado (R25, R26); undefined = solo lectura.
  onCambiarEstado?: (estado: 'libre' | 'fuera_servicio') => void;
  procesando?: boolean;
}

// Icono según el tipo: suite, doble (o más camas) o sencilla.
export function iconoTipoHabitacion(nombre: string): LucideIcon {
  const tipo = nombre.toLowerCase();
  if (tipo.includes('suite')) return Crown;
  if (tipo.includes('sencilla') || tipo.includes('individual')) return Bed;
  return BedDouble;
}

// Tarjeta de habitación: número, tipo, tarifa base, estado y acciones de estado.
export function TarjetaHabitacion({ habitacion, onCambiarEstado, procesando }: Props) {
  const { tipoHabitacion: tipo, estado } = habitacion;
  const Icono = iconoTipoHabitacion(tipo.nombre);
  return (
    <div className={`tarjeta-habitacion ${estado}`}>
      <div className="tarjeta-habitacion-cabecera">
        <div>
          <div className="numero">{habitacion.numero}</div>
          <div className="tipo">
            {tipo.nombre} · hasta {tipo.capacidadMaxima} huéspedes
          </div>
        </div>
        <div className="icono-tipo">
          <Icono size={20} />
        </div>
      </div>
      <div className="tarifa">
        desde <strong>{formatearDinero(tipo.tarifaBase)}</strong> / noche
      </div>
      <span className={`badge-estado ${estado}`}>{ETIQUETA_ESTADO_HABITACION[estado]}</span>
      {onCambiarEstado && estado !== 'ocupada' && (
        <div className="acciones-tarjeta">
          {estado === 'en_limpieza' && (
            <button
              className="primario"
              disabled={procesando}
              onClick={() => onCambiarEstado('libre')}
            >
              <CheckCircle2 size={14} /> Marcar lista
            </button>
          )}
          {(estado === 'libre' || estado === 'en_limpieza') && (
            <button
              className="enlace"
              disabled={procesando}
              onClick={() => onCambiarEstado('fuera_servicio')}
            >
              <Wrench size={14} /> Fuera de servicio
            </button>
          )}
          {estado === 'fuera_servicio' && (
            <button
              className="secundario"
              disabled={procesando}
              onClick={() => onCambiarEstado('libre')}
            >
              <RotateCcw size={14} /> Volver a servicio
            </button>
          )}
        </div>
      )}
    </div>
  );
}
