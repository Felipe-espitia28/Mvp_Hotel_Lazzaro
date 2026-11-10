import { useEffect, useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { api } from '../api/client';
import { ReglasContrasena } from '../components/ReglasContrasena';
import { cumpleTodo, reglasContrasena } from '../logica/contrasena';
import { aplicarTema } from '../logica/tema';

// Plan 18 (R73): la página del enlace de "¿Olvidaste tu contraseña?". El
// enlace sirve una sola vez; al terminar, se entra con la contraseña nueva.
export function Restablecer({ token }: { token: string }) {
  const [nueva, setNueva] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => aplicarTema(null), []);

  // Aquí no se conoce el correo: esa regla la revisa el backend.
  const reglas = reglasContrasena(nueva, { email: '' }).filter((r) => r.texto !== 'Sin tu correo');

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    if (nueva !== confirmacion) {
      setError('La confirmación no coincide con la contraseña nueva');
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      await api.restablecer(token, nueva);
      setListo(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo restablecer la contraseña');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="pagina-publica">
      <form className="tarjeta tarjeta-pago" onSubmit={guardar}>
        <h2>
          <KeyRound size={20} /> Crea una contraseña nueva
        </h2>
        {listo ? (
          <>
            <div className="mensaje-exito">
              Listo: tu contraseña cambió y tus otras sesiones se cerraron.
            </div>
            <a className="acento ancho-completo boton-enlace" href="/">
              Ir a iniciar sesión
            </a>
          </>
        ) : (
          <>
            <div className="campo">
              <label htmlFor="restablecer-nueva">Contraseña nueva</label>
              <input
                id="restablecer-nueva"
                type="password"
                autoComplete="new-password"
                value={nueva}
                onChange={(e) => setNueva(e.target.value)}
                required
              />
            </div>
            <ReglasContrasena reglas={reglas} />
            <div className="campo">
              <label htmlFor="restablecer-confirmacion">Repite la contraseña</label>
              <input
                id="restablecer-confirmacion"
                type="password"
                autoComplete="new-password"
                value={confirmacion}
                onChange={(e) => setConfirmacion(e.target.value)}
                required
              />
            </div>
            {error && <div className="mensaje-error">{error}</div>}
            <button className="acento ancho-completo" disabled={enviando || !cumpleTodo(reglas)}>
              {enviando ? 'Guardando...' : 'Guardar contraseña'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
