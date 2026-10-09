import { useState, type FormEvent } from 'react';
import { api } from '../api/client';

interface Props {
  onCerrar: () => void;
  onCreada: () => void;
}

// Formulario modal sencillo para crear una habitación.
export function ModalNuevaHabitacion({ onCerrar, onCreada }: Props) {
  const [numero, setNumero] = useState('');
  const [tipo, setTipo] = useState('sencilla');
  const [tarifaNoche, setTarifaNoche] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function manejarSubmit(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await api.crearHabitacion({
        numero,
        tipo,
        tarifaNoche: Number(tarifaNoche),
      });
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
            <select id="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="sencilla">Sencilla</option>
              <option value="doble">Doble</option>
              <option value="suite">Suite</option>
            </select>
          </div>
          <div className="campo">
            <label htmlFor="tarifa">Tarifa por noche</label>
            <input
              id="tarifa"
              type="number"
              min="1"
              step="1"
              value={tarifaNoche}
              onChange={(e) => setTarifaNoche(e.target.value)}
              required
            />
          </div>
          <div className="acciones-modal">
            <button type="button" className="secundario" onClick={onCerrar}>
              Cancelar
            </button>
            <button type="submit" className="primario" disabled={enviando}>
              {enviando ? 'Guardando...' : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
