import { useState, type FormEvent } from 'react';
import { KeyRound, LogOut } from 'lucide-react';
import { api } from '../api/client';
import type { Sesion } from '../api/types';
import { ReglasContrasena } from '../components/ReglasContrasena';
import { cumpleTodo, reglasContrasena } from '../logica/contrasena';

// Plan 18 (R71): quien entra con la contraseña temporal del correo no puede
// ir a otra parte hasta crear la suya (el backend lo hace cumplir con 403).
export function CrearContrasena({
  sesion,
  onLista,
  onSalir,
}: {
  sesion: Sesion;
  onLista: (nueva: Sesion) => void;
  onSalir: () => void;
}) {
  const [temporal, setTemporal] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const reglas = reglasContrasena(nueva, { email: sesion.usuario.email, temporal });

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    if (nueva !== confirmacion) {
      setError('La confirmación no coincide con la contraseña nueva');
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      onLista(await api.cambiarContrasena(temporal, nueva));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la contraseña');
      setEnviando(false);
    }
  }

  return (
    <div className="pagina-publica">
      <form className="tarjeta tarjeta-pago" onSubmit={guardar}>
        <h2>
          <KeyRound size={20} /> Crea tu contraseña
        </h2>
        <p className="texto-secundario">
          Hola, {sesion.usuario.nombre}. Entraste con la contraseña temporal que te llegó al correo;
          antes de seguir, crea la tuya.
        </p>
        <div className="campo">
          <label htmlFor="crear-temporal">Contraseña temporal</label>
          <input
            id="crear-temporal"
            type="password"
            autoComplete="current-password"
            value={temporal}
            onChange={(e) => setTemporal(e.target.value)}
            required
          />
        </div>
        <div className="campo">
          <label htmlFor="crear-nueva">Tu contraseña nueva</label>
          <input
            id="crear-nueva"
            type="password"
            autoComplete="new-password"
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            required
          />
        </div>
        <ReglasContrasena reglas={reglas} />
        <div className="campo">
          <label htmlFor="crear-confirmacion">Repite la contraseña</label>
          <input
            id="crear-confirmacion"
            type="password"
            autoComplete="new-password"
            value={confirmacion}
            onChange={(e) => setConfirmacion(e.target.value)}
            required
          />
        </div>
        {error && <div className="mensaje-error">{error}</div>}
        <button
          className="acento ancho-completo"
          disabled={enviando || !temporal || !cumpleTodo(reglas)}
        >
          {enviando ? 'Guardando...' : 'Guardar y entrar'}
        </button>
        <button type="button" className="enlace" onClick={onSalir}>
          <LogOut size={14} /> Salir
        </button>
      </form>
    </div>
  );
}
