import { KeyRound } from 'lucide-react';
import { CabeceraModal } from './CabeceraModal';
import { useState, type FormEvent } from 'react';
import { api } from '../api/client';
import type { Sesion } from '../api/types';
import { cumpleTodo, reglasContrasena } from '../logica/contrasena';
import { ReglasContrasena } from './ReglasContrasena';

interface Props {
  onCerrar: () => void;
  // Plan 18: el cambio devuelve un token nuevo (el anterior queda inválido).
  onSesion: (nueva: Sesion) => void;
  // Para la regla "sin tu correo" (R72).
  email: string;
}

// Cambio de la contraseña propia: exige la actual.
export function ModalCambiarContrasena({ onCerrar, onSesion, email }: Props) {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const reglas = reglasContrasena(nueva, { email });

  async function manejarSubmit(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    if (nueva !== confirmacion) {
      setError('La confirmación no coincide con la nueva contraseña');
      return;
    }
    setEnviando(true);
    try {
      onSesion(await api.cambiarContrasena(actual, nueva));
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
        <CabeceraModal icono={KeyRound} titulo="Cambiar mi contraseña" />
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
                value={nueva}
                onChange={(e) => setNueva(e.target.value)}
                required
              />
            </div>
            <ReglasContrasena reglas={reglas} />
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
              <button type="submit" className="primario" disabled={enviando || !cumpleTodo(reglas)}>
                {enviando ? 'Guardando...' : 'Cambiar'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
