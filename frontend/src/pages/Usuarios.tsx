import { useCallback, useEffect, useState } from 'react';
import { KeyRound, UserCheck, UserMinus, UserPlus } from 'lucide-react';
import { iniciales } from '../components/Marca';
import type { GestionEquipo } from '../api/client';
import type { RolDeHotel, Usuario } from '../api/types';
import { ModalNuevoUsuario } from '../components/ModalNuevoUsuario';
import { ETIQUETA_ROL } from '../formato';

interface Props {
  // De dónde salen y a dónde van los cambios: el equipo del propio hotel
  // (Gerencia) o el de un hotel cualquiera (Consola Lazaro).
  gestion: GestionEquipo;
  // Quien mira la pantalla, si es parte de este equipo (no puede desactivarse).
  idUsuarioActual?: string;
  titulo?: string;
}

// Personas con acceso a un hotel: alta, rol, desactivación y contraseña.
export function Usuarios({ gestion, idUsuarioActual, titulo = 'Equipo del hotel' }: Props) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [mostrarModal, setMostrarModal] = useState(false);

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

  function cambiarRol(u: Usuario, rol: RolDeHotel) {
    ejecutar(u.id, async () => {
      await gestion.actualizar(u.id, { rol });
      return `${u.nombre} ahora es ${ETIQUETA_ROL[rol].toLowerCase()}.`;
    });
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

  function restablecer(u: Usuario) {
    const nueva = window.prompt(`Nueva contraseña para ${u.nombre} (mínimo 8 caracteres):`);
    if (!nueva) return;
    ejecutar(u.id, async () => {
      await gestion.restablecer(u.id, nueva);
      return `Contraseña de ${u.nombre} restablecida. Compártela por un canal seguro.`;
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
                    <select
                      value={u.rol}
                      disabled={esYo || procesando === u.id}
                      title={esYo ? 'No puedes cambiar tu propio rol' : undefined}
                      onChange={(e) => cambiarRol(u, e.target.value as RolDeHotel)}
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
                          {u.activo ? <UserMinus size={14} /> : <UserCheck size={14} />}
                          {u.activo ? 'Desactivar' : 'Reactivar'}
                        </button>
                      )}
                      <button
                        className="secundario"
                        disabled={procesando === u.id}
                        onClick={() => restablecer(u)}
                      >
                        <KeyRound size={14} /> Restablecer contraseña
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {mostrarModal && (
        <ModalNuevoUsuario
          crear={gestion.crear}
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
