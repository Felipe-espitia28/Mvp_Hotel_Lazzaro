import { UserPlus } from 'lucide-react';
import { CabeceraModal } from './CabeceraModal';
import { useState, type FormEvent } from 'react';
import type { NuevoUsuario } from '../api/client';
import type { RolDeHotel } from '../api/types';

interface Props {
  crear: (datos: NuevoUsuario) => Promise<{ email: string; correoEnviado: boolean }>;
  onCerrar: () => void;
  onCreado: (creado: { email: string; correoEnviado: boolean }) => void;
}

export function ModalNuevoUsuario({ crear, onCerrar, onCreado }: Props) {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [rol, setRol] = useState<RolDeHotel>('recepcionista');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function manejarSubmit(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      onCreado(await crear({ nombre, email, rol }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear el usuario');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <CabeceraModal icono={UserPlus} titulo="Nuevo usuario" />
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
          <p className="texto-secundario">
            Le enviaremos una contraseña temporal a su correo. Al entrar, creará la suya.
          </p>
          <div className="campo">
            <label htmlFor="rol-usuario">Rol</label>
            <select
              id="rol-usuario"
              value={rol}
              onChange={(e) => setRol(e.target.value as RolDeHotel)}
            >
              <option value="recepcionista">Recepcionista</option>
              <option value="admin">Administrador</option>
              <option value="housekeeping">Camarera (limpieza)</option>
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
