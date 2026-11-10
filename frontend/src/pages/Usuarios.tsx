import { useCallback, useEffect, useState } from 'react';
import { KeyRound, SlidersHorizontal, UserCheck, UserCog, UserMinus, UserPlus } from 'lucide-react';
import { iniciales } from '../components/Marca';
import type { GestionEquipo } from '../api/client';
import type { Permiso, Usuario } from '../api/types';
import { ModalNuevoUsuario } from '../components/ModalNuevoUsuario';

interface Props {
  // De dónde salen y a dónde van los cambios: el equipo del propio hotel
  // (Gerencia) o el de un hotel cualquiera (Consola Lazaro).
  gestion: GestionEquipo;
  // Quien mira la pantalla, si es parte de este equipo (no puede desactivarse).
  idUsuarioActual?: string;
  titulo?: string;
  // Plan 19: los permisos de quien edita (R76); null: la Consola, que puede dar todo.
  puedeDar: Permiso[] | null;
}

// Personas con acceso a un hotel: alta, rol, desactivación y contraseña.
export function Usuarios({
  gestion,
  idUsuarioActual,
  titulo = 'Equipo del hotel',
  puedeDar,
}: Props) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [editando, setEditando] = useState<Usuario | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setUsuarios(await gestion.listar());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar los usuarios');
    } finally {
      setCargando(false);
    }
  }, [gestion]);

  useEffect(() => {
    cargar();
  }, [cargar]);

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

  function cambiarEstado(u: Usuario) {
    if (
      u.activo &&
      !window.confirm(`¿Desactivar a ${u.nombre}? Su sesión se cerrará de inmediato.`)
    ) {
      return;
    }
    ejecutar(u.id, async () => {
      await gestion.actualizar(u.id, { activo: !u.activo });
      return u.activo ? `${u.nombre} fue desactivado.` : `${u.nombre} fue reactivado.`;
    });
  }

  // R70/R74: una contraseña temporal nueva al correo; la anterior deja de servir.
  function reenviar(u: Usuario) {
    if (
      !window.confirm(
        `¿Reenviar las credenciales a ${u.nombre} (${u.email})? Se cerrarán sus sesiones abiertas.`,
      )
    ) {
      return;
    }
    ejecutar(u.id, async () => {
      const { correoEnviado } = await gestion.reenviar(u.id);
      return correoEnviado
        ? `Le enviamos una contraseña temporal nueva a ${u.email}.`
        : `La contraseña temporal cambió, pero el correo a ${u.email} no salió. Inténtalo de nuevo.`;
    });
  }

  if (cargando) return <p>Cargando...</p>;

  return (
    <div>
      <div className="barra-titulo">
        <h2>{titulo}</h2>
        <button className="acento" onClick={() => setMostrarModal(true)}>
          <UserPlus size={16} /> Nuevo usuario
        </button>
      </div>
      {error && <div className="mensaje-error">{error}</div>}
      {aviso && <div className="mensaje-exito">{aviso}</div>}

      <div className="contenedor-tabla">
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
                    <div className="celda-huesped">
                      <span className="avatar claro">{iniciales(u.nombre)}</span>
                      <span>
                        {u.nombre}
                        {esYo && <span className="texto-secundario"> (tú)</span>}
                      </span>
                    </div>
                  </td>
                  <td>{u.email}</td>
                  <td>
                    {u.rol?.nombre ?? '—'}
                    {u.tieneAjustes && (
                      <span
                        className="badge-estado en_limpieza marca-ajustes"
                        title="Tiene permisos agregados o quitados frente a su rol"
                      >
                        <SlidersHorizontal size={12} /> Permisos ajustados
                      </span>
                    )}
                  </td>
                  <td>
                    <span
                      className={`badge-estado ${
                        !u.activo ? 'cerrada' : u.debeCambiarContrasena ? 'en_limpieza' : 'libre'
                      }`}
                    >
                      {!u.activo
                        ? 'Inactivo'
                        : u.debeCambiarContrasena
                          ? 'Pendiente de activar'
                          : 'Activo'}
                    </span>
                  </td>
                  <td>
                    <div className="acciones-tabla">
                      {!esYo && (
                        <button
                          className="secundario"
                          disabled={procesando === u.id}
                          onClick={() => setEditando(u)}
                        >
                          <UserCog size={14} /> Editar
                        </button>
                      )}
                      {!esYo && (
                        <button
                          className={u.activo ? 'peligro' : 'secundario'}
                          disabled={procesando === u.id}
                          onClick={() => cambiarEstado(u)}
                        >
                          {u.activo ? <UserMinus size={14} /> : <UserCheck size={14} />}
                          {u.activo ? 'Desactivar' : 'Reactivar'}
                        </button>
                      )}
                      {!esYo && u.activo && (
                        <button
                          className="secundario"
                          disabled={procesando === u.id}
                          onClick={() => reenviar(u)}
                        >
                          <KeyRound size={14} /> Reenviar credenciales
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editando && (
        <ModalNuevoUsuario
          gestion={gestion}
          usuario={editando}
          puedeDar={puedeDar}
          onCerrar={() => setEditando(null)}
          onGuardado={() => {
            setEditando(null);
            setAviso(`${editando.nombre} quedó actualizado. Los cambios aplican de inmediato.`);
            cargar();
          }}
        />
      )}
      {mostrarModal && (
        <ModalNuevoUsuario
          gestion={gestion}
          puedeDar={puedeDar}
          onCerrar={() => setMostrarModal(false)}
          onGuardado={(creado) => {
            setMostrarModal(false);
            if (creado.correoEnviado) {
              setAviso(`Usuario creado. Le enviamos una contraseña temporal a ${creado.email}.`);
            } else {
              setError(`El usuario se creó, pero el correo no salió. Usa Reenviar credenciales.`);
            }
            cargar();
          }}
        />
      )}
    </div>
  );
}
