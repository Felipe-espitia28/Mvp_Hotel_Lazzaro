import { useState, type FormEvent } from 'react';
import { api } from '../api/client';
import type { Sesion } from '../api/types';

interface Props {
  onIngreso: (sesion: Sesion) => void;
  aviso?: string | null;
}

export function Login({ onIngreso, aviso }: Props) {
  const [email, setEmail] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function ingresar(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      onIngreso(await api.login(email, contrasena));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar sesión');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="pantalla-login">
      <form className="tarjeta-login" onSubmit={ingresar}>
        <h1>MVP Hotel</h1>
        <p className="subtitulo">Ingresa con tu usuario del hotel</p>
        {aviso && !error && <div className="mensaje-aviso">{aviso}</div>}
        {error && <div className="mensaje-error">{error}</div>}
        <div className="campo">
          <label htmlFor="email">Correo</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="campo">
          <label htmlFor="contrasena">Contraseña</label>
          <input
            id="contrasena"
            type="password"
            autoComplete="current-password"
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
            required
          />
        </div>
        <button type="submit" className="primario ancho-completo" disabled={enviando}>
          {enviando ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}
