import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { EventoReserva, TipoEventoReserva } from '../api/types';
import { ETIQUETA_ROL, formatearFechaHora } from '../formato';

const ETIQUETA_EVENTO: Record<TipoEventoReserva, string> = {
  creada: 'Reserva creada',
  check_in: 'Check-in',
  check_out: 'Check-out',
  cancelada: 'Cancelada',
  cargo_agregado: 'Consumo cargado',
  cargo_anulado: 'Consumo anulado',
  no_show: 'Marcada como no-show',
};

// Auditoría de una reserva (R34): quién hizo cada acción y cuándo.
export function HistorialReserva({ reservaId }: { reservaId: string }) {
  const [eventos, setEventos] = useState<EventoReserva[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .historialReserva(reservaId)
      .then(setEventos)
      .catch((e) => setError(e instanceof Error ? e.message : 'Error al cargar el historial'));
  }, [reservaId]);

  if (error) return <div className="mensaje-error">{error}</div>;
  if (!eventos) return <p className="texto-secundario">Cargando historial...</p>;
  if (eventos.length === 0) {
    return (
      <p className="texto-secundario">
        Sin historial: la reserva es anterior al registro de auditoría.
      </p>
    );
  }

  return (
    <ol className="historial">
      {eventos.map((e) => (
        <li key={e.id}>
          <span className="historial-fecha">{formatearFechaHora(e.fecha)}</span>
          <strong>{ETIQUETA_EVENTO[e.tipo]}</strong>
          {e.detalle && <span> · {e.detalle}</span>}
          <span className="texto-secundario">
            {' '}
            — {e.usuario ? `${e.usuario.nombre} (${ETIQUETA_ROL[e.usuario.rol]})` : 'Sistema'}
          </span>
        </li>
      ))}
    </ol>
  );
}
