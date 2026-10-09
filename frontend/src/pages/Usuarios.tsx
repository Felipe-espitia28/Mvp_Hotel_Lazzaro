import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { RolUsuario, Usuario } from '../api/types';
import { ModalNuevoUsuario } from '../components/ModalNuevoUsuario';
import { ETIQUETA_ROL } from '../formato';

interface Props {
  idUsuarioActual: string;
}

// Gestión de las personas que usan el sistema (solo administradores).
export function Usuarios({ idUsuarioActual }: Props) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [mostrarModal, setMostrarModal] = useState(false);

  async function cargar() {
    setCargando(true);
    try {
      setUsuarios(await api.listarUsuarios());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar los usuarios');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  async function ejecutar(id: string, accion: () => Promise<string>) {
    setError(null);
    setAviso(null);
    setProcesando(id);
    try {
      setAviso(await accion());
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ocurrió un error');
    } finally {
      setProcesando(null);
    }
  }

  function cambiarRol(u: Usuario, rol: RolUsuario) {
    ejecutar(u.id, async () => {
      await api.actualizarUsuario(u.id, { rol });
      return `${u.nombre} ahora es ${ETIQUETA_ROL[rol].toLowerCase()}.`;
    });
  }

  function cambiarEstado(u: Usuario) {
    if (u.activo && !window.confirm(`¿Desactivar a ${u.nombre}? Su sesión se cerrará de inmediato.`)) {
      return;
    }
    ejecutar(u.id, async () => {
      await api.actualizarUsuario(u.id, { activo: !u.activo });
      return u.activo ? `${u.nombre} fue desactivado.` : `${u.nombre} fue reactivado.`;
    });
  }

  function restablecer(u: Usuario) {
    const nueva = window.prompt(`Nueva contraseña para ${u.nombre} (mínimo 8 caracteres):`);
    if (!nueva) return;
    ejecutar(u.id, async () => {
      await api.restablecerContrasena(u.id, nueva);
      return `Contraseña de ${u.nombre} restablecida. Compártela por un canal seguro.`;
    });
  }

  if (cargando) return <p>Cargando...</p>;

  return (
    <div>
      <div className="barra-titulo">
        <h2>Usuarios del sistema</h2>
        <button className="primario" onClick={() => setMostrarModal(true)}>
          + Nuevo usuario
        </button>
      </div>
      {error && <div className="mensaje-error">{error}</div>}
      {aviso && <div className="mensaje-exito">{aviso}</div>}

      <table className="tabla">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Correo</th>
            <th>Rol</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map((u) => {
            const esYo = u.id === idUsuarioActual;
            return (
              <tr key={u.id} className={u.activo ? '' : 'fila-inactiva'}>
                <td>
                  {u.nombre}
                  {esYo && <span className="texto-secundario"> (tú)</span>}
                </td>
                <td>{u.email}</td>
                <td>
                  <select
                    value={u.rol}
                    disabled={esYo || procesando === u.id}
                    title={esYo ? 'No puedes cambiar tu propio rol' : undefined}
                    onChange={(e) => cambiarRol(u, e.target.value as RolUsuario)}
                  >
                    <option value="recepcionista">{ETIQUETA_ROL.recepcionista}</option>
                    <option value="admin">{ETIQUETA_ROL.admin}</option>
                  </select>
                </td>
                <td>
                  <span className={`badge-estado ${u.activo ? 'libre' : 'cerrada'}`}>
                    {u.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td>
                  <div className="acciones-tabla">
                    {!esYo && (
                      <button
                        className={u.activo ? 'peligro' : 'secundario'}
                        disabled={procesando === u.id}
                        onClick={() => cambiarEstado(u)}
                      >
                        {u.activo ? 'Desactivar' : 'Reactivar'}
                      </button>
                    )}
                    <button
                      className="secundario"
                      disabled={procesando === u.id}
                      onClick={() => restablecer(u)}
                    >
                      Restablecer contraseña
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {mostrarModal && (
        <ModalNuevoUsuario
          onCerrar={() => setMostrarModal(false)}
          onCreado={() => {
            setMostrarModal(false);
            setAviso('Usuario creado.');
            cargar();
          }}
        />
      )}
    </div>
  );
}
