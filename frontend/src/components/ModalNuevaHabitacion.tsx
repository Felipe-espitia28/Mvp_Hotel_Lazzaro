import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api/client';
import type { TipoHabitacion } from '../api/types';
import { formatearDinero } from '../formato';

interface Props {
  onCerrar: () => void;
  onCreada: () => void;
}

// Formulario modal para crear una habitación. El precio y la capacidad los
// define su tipo (se editan en la pestaña Tarifas).
export function ModalNuevaHabitacion({ onCerrar, onCreada }: Props) {
  const [numero, setNumero] = useState('');
  const [tipos, setTipos] = useState<TipoHabitacion[]>([]);
  const [tipoHabitacionId, setTipoHabitacionId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api
      .tiposHabitacion()
      .then((lista) => {
        setTipos(lista);
        setTipoHabitacionId((actual) => actual || lista[0]?.id || '');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Error al cargar los tipos'));
  }, []);

  async function manejarSubmit(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await api.crearHabitacion({ numero, tipoHabitacionId });
      onCreada();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear la habitación');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Nueva habitación</h2>
        {error && <div className="mensaje-error">{error}</div>}
        <form onSubmit={manejarSubmit}>
          <div className="campo">
            <label htmlFor="numero">Número</label>
            <input
              id="numero"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              required
            />
          </div>
          <div className="campo">
            <label htmlFor="tipo">Tipo</label>
            <select
              id="tipo"
              value={tipoHabitacionId}
              onChange={(e) => setTipoHabitacionId(e.target.value)}
              required
            >
              {tipos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre} — desde {formatearDinero(t.tarifaBase)}, hasta {t.capacidadMaxima}{' '}
                  huéspedes
                </option>
              ))}
            </select>
          </div>
          <div className="acciones-modal">
            <button type="button" className="secundario" onClick={onCerrar}>
              Cancelar
            </button>
            <button type="submit" className="primario" disabled={enviando || !tipoHabitacionId}>
              {enviando ? 'Guardando...' : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
