import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { formatearDinero, formatearFechaHora } from '../formato';
import { ETIQUETA_ESTADO_CITA } from '../logica/agenda';

type Datos = Awaited<ReturnType<typeof api.agenda.deReserva>>;

// S-2: las citas y los cupos de una reserva, en su detalle.
export function ServiciosDeReserva({ reservaId }: { reservaId: string }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.agenda
      .deReserva(reservaId)
      .then(setDatos)
      .catch((e) => setError(e instanceof Error ? e.message : 'Error al cargar las citas'));
  }, [reservaId]);

  if (error) return <div className="mensaje-error">{error}</div>;
  if (!datos) return <p>Cargando...</p>;
  if (datos.citas.length === 0 && datos.cupos.length === 0) {
    return <p className="texto-secundario">Sin citas ni experiencias.</p>;
  }
  return (
    <ul className="lista-servicios-reserva">
      {datos.citas.map((c) => (
        <li key={c.id}>
          {formatearFechaHora(c.inicio)} · {c.concepto} · {c.recurso.nombre} ·{' '}
          {formatearDinero(c.valor)} ·{' '}
          <span className={`badge-estado cita-${c.estado}`}>{ETIQUETA_ESTADO_CITA[c.estado]}</span>
        </li>
      ))}
      {datos.cupos.map((c) => (
        <li key={c.id}>
          {formatearFechaHora(c.salida.inicio)} · {c.concepto} · {formatearDinero(c.valor)}
          {c.estado === 'cancelado' && ' · cancelado'}
        </li>
      ))}
    </ul>
  );
}
