import { useState, type FormEvent } from 'react';
import { Wrench } from 'lucide-react';
import { api } from '../api/client';
import type { Incidencia, PrioridadIncidencia } from '../api/types';
import { ETIQUETA_PRIORIDAD } from '../logica/limpieza';
import { CabeceraModal } from './CabeceraModal';

// B-4: reportar un daño en una habitación. Si la saca de servicio, deja de
// venderse y se avisa de las reservas que hay que reubicar (R26).
export function ModalIncidencia({
  habitacion,
  onCerrar,
  onReportada,
}: {
  habitacion: { id: string; numero: string };
  onCerrar: () => void;
  onReportada: (incidencia: Incidencia) => void;
}) {
  const [descripcion, setDescripcion] = useState('');
  const [prioridad, setPrioridad] = useState<PrioridadIncidencia>('media');
  const [sacaDeServicio, setSacaDeServicio] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function reportar(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      onReportada(
        await api.incidencias.reportar({
          habitacionId: habitacion.id,
          descripcion,
          prioridad,
          sacaDeServicio,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo reportar');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={reportar}>
        <CabeceraModal icono={Wrench} titulo={`Reportar un daño en la ${habitacion.numero}`} />
        <div className="campo">
          <label htmlFor="incidencia-descripcion">¿Qué pasa?</label>
          <textarea
            id="incidencia-descripcion"
            rows={3}
            maxLength={500}
            required
            placeholder="p. ej. Gotera en el baño"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
          />
        </div>
        <div className="campo">
          <label htmlFor="incidencia-prioridad">Prioridad</label>
          <select
            id="incidencia-prioridad"
            value={prioridad}
            onChange={(e) => setPrioridad(e.target.value as PrioridadIncidencia)}
          >
            {(Object.keys(ETIQUETA_PRIORIDAD) as PrioridadIncidencia[]).map((p) => (
              <option key={p} value={p}>
                {ETIQUETA_PRIORIDAD[p]}
              </option>
            ))}
          </select>
        </div>
        <label className="casilla">
          <input
            type="checkbox"
            checked={sacaDeServicio}
            onChange={(e) => setSacaDeServicio(e.target.checked)}
          />
          No se puede usar: sacarla de servicio
        </label>
        {error && <div className="mensaje-error">{error}</div>}
        <div className="acciones-modal">
          <button type="button" className="secundario" onClick={onCerrar}>
            Cancelar
          </button>
          <button className="primario" disabled={enviando || descripcion.trim() === ''}>
            {enviando ? 'Reportando...' : 'Reportar'}
          </button>
        </div>
      </form>
    </div>
  );
}
