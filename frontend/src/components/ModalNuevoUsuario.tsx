import { useState, type FormEvent } from 'react';
import { api } from '../api/client';
import type { RolUsuario } from '../api/types';

interface Props {
  onCerrar: () => void;
  onCreado: () => void;
}

export function ModalNuevoUsuario({ onCerrar, onCreado }: Props) {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [rol, setRol] = useState<RolUsuario>('recepcionista');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function manejarSubmit(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await api.crearUsuario({ nombre, email, contrasena, rol });
      onCreado();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear el usuario');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Nuevo usuario</h2>
        {error && <div className="mensaje-error">{error}</div>}
        <form onSubmit={manejarSubmit}>
          <div className="campo">
            <label htmlFor="nombre-usuario">Nombre</label>
            <input
              id="nombre-usuario"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
            />
          </div>
          <div className="campo">
            <label htmlFor="email-usuario">Correo</label>
            <input
              id="email-usuario"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="campo">
            <label htmlFor="contrasena-usuario">Contraseña inicial</label>
            <input
              id="contrasena-usuario"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
              required
            />
            <span className="texto-secundario">
              Mínimo 8 caracteres. El usuario puede cambiarla al entrar.
            </span>
          </div>
          <div className="campo">
            <label htmlFor="rol-usuario">Rol</label>
            <select
              id="rol-usuario"
              value={rol}
              onChange={(e) => setRol(e.target.value as RolUsuario)}
            >
              <option value="recepcionista">Recepcionista</option>
              <option value="admin">Administrador</option>
            </select>
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
