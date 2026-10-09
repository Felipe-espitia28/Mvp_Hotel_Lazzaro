import { useState, type FormEvent } from 'react';
import { api } from '../api/client';

interface Props {
  onCerrar: () => void;
}

// Cambio de la contraseña propia: exige la actual.
export function ModalCambiarContrasena({ onCerrar }: Props) {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function manejarSubmit(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    if (nueva !== confirmacion) {
      setError('La confirmación no coincide con la nueva contraseña');
      return;
    }
    setEnviando(true);
    try {
      await api.cambiarContrasena(actual, nueva);
      setListo(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar la contraseña');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Cambiar mi contraseña</h2>
        {listo ? (
          <>
            <div className="mensaje-exito">Contraseña actualizada.</div>
            <div className="acciones-modal">
              <button className="primario" onClick={onCerrar}>
                Cerrar
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={manejarSubmit}>
            {error && <div className="mensaje-error">{error}</div>}
            <div className="campo">
              <label htmlFor="actual">Contraseña actual</label>
              <input
                id="actual"
                type="password"
                autoComplete="current-password"
                value={actual}
                onChange={(e) => setActual(e.target.value)}
                required
              />
            </div>
            <div className="campo">
              <label htmlFor="nueva">Nueva contraseña</label>
              <input
                id="nueva"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={nueva}
                onChange={(e) => setNueva(e.target.value)}
                required
              />
            </div>
            <div className="campo">
              <label htmlFor="confirmacion">Repite la nueva contraseña</label>
              <input
                id="confirmacion"
                type="password"
                autoComplete="new-password"
                value={confirmacion}
                onChange={(e) => setConfirmacion(e.target.value)}
                required
              />
            </div>
            <div className="acciones-modal">
              <button type="button" className="secundario" onClick={onCerrar}>
                Cancelar
              </button>
              <button type="submit" className="primario" disabled={enviando}>
                {enviando ? 'Guardando...' : 'Cambiar'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
