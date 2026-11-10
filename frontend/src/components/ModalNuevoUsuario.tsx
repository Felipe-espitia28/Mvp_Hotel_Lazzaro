import { useEffect, useState, type FormEvent } from 'react';
import { ChevronDown, UserPlus, UserCog } from 'lucide-react';
import type { GestionEquipo } from '../api/client';
import type { CatalogoPermisos, Permiso, RolHotel, Usuario } from '../api/types';
import { ajustesDesde, origen } from '../logica/permisos';
import { CabeceraModal } from './CabeceraModal';
import { SelectorPermisos } from './SelectorPermisos';

interface Props {
  gestion: GestionEquipo;
  // Para editar; sin ella, crea una persona nueva.
  usuario?: Usuario;
  // Los permisos de quien edita (R76); null: la Consola Lazaro puede dar todo.
  puedeDar: Permiso[] | null;
  onCerrar: () => void;
  onGuardado: (resultado: { email: string; correoEnviado?: boolean }) => void;
}

// Plan 19: una persona del hotel: su rol y, si hace falta, sus permisos
// ajustados (agregar o quitar sueltos sin crear otro rol). Plan 18: al
// crearla, la contraseña temporal llega a su correo.
export function ModalNuevoUsuario({ gestion, usuario, puedeDar, onCerrar, onGuardado }: Props) {
  const [nombre, setNombre] = useState(usuario?.nombre ?? '');
  const [email, setEmail] = useState(usuario?.email ?? '');
  const [roles, setRoles] = useState<RolHotel[]>([]);
  const [catalogo, setCatalogo] = useState<CatalogoPermisos | null>(null);
  const [rolId, setRolId] = useState(usuario?.rol?.id ?? '');
  const [deseados, setDeseados] = useState<Permiso[]>(usuario?.permisosEfectivos ?? []);
  const [ajustando, setAjustando] = useState(usuario?.tieneAjustes ?? false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    Promise.all([gestion.roles(), gestion.catalogo()])
      .then(([lista, cat]) => {
        setRoles(lista);
        setCatalogo(cat);
        if (!usuario && lista.length > 0) {
          // Por defecto, el rol de recepción (o el primero).
          const inicial = lista.find((r) => r.nombre === 'Recepción') ?? lista[0];
          setRolId(inicial.id);
          setDeseados(inicial.permisos);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudieron cargar los roles'));
  }, [gestion, usuario]);

  const rol = roles.find((r) => r.id === rolId);
  const delRol = rol?.permisos ?? [];

  function elegirRol(id: string) {
    setRolId(id);
    // Al cambiar de rol, los ajustes vuelven a empezar desde ese rol.
    setDeseados(roles.find((r) => r.id === id)?.permisos ?? []);
  }

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);
    const ajustes = ajustesDesde(delRol, deseados);
    try {
      if (usuario) {
        await gestion.actualizar(usuario.id, { nombre, rolId, ...ajustes });
        onGuardado({ email: usuario.email });
      } else {
        onGuardado(await gestion.crear({ nombre, email, rolId, ...ajustes }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setEnviando(false);
    }
  }

  const ajustes = ajustesDesde(delRol, deseados);
  const hayAjustes = ajustes.permisosAgregados.length + ajustes.permisosQuitados.length > 0;
  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal modal-ancho" onClick={(e) => e.stopPropagation()}>
        <CabeceraModal
          icono={usuario ? UserCog : UserPlus}
          titulo={usuario ? `Editar a ${usuario.nombre}` : 'Nuevo usuario'}
        />
        {error && <div className="mensaje-error">{error}</div>}
        <form onSubmit={guardar}>
          <div className="campo">
            <label htmlFor="nombre-usuario">Nombre</label>
            <input
              id="nombre-usuario"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
            />
          </div>
          {!usuario && (
            <>
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
            </>
          )}
          <div className="campo">
            <label htmlFor="rol-usuario">Rol</label>
            <select id="rol-usuario" value={rolId} onChange={(e) => elegirRol(e.target.value)}>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre}
                </option>
              ))}
            </select>
            {rol?.descripcion && <p className="texto-secundario">{rol.descripcion}</p>}
          </div>

          <button
            type="button"
            className="enlace"
            aria-expanded={ajustando}
            onClick={() => setAjustando(!ajustando)}
          >
            <ChevronDown size={14} /> Ajustar permisos de esta persona
            {hayAjustes && ' (ajustados)'}
          </button>
          {ajustando && catalogo && (
            <SelectorPermisos
              catalogo={catalogo}
              seleccion={deseados}
              onCambio={setDeseados}
              puedeDar={puedeDar === null ? null : [...new Set([...puedeDar, ...delRol])]}
              origenDe={(clave) => origen(clave, delRol, deseados)}
            />
          )}
          <p className="texto-secundario">
            Permisos efectivos: <strong>{deseados.length}</strong>
            {hayAjustes &&
              ` (${ajustes.permisosAgregados.length} agregado(s), ${ajustes.permisosQuitados.length} quitado(s) frente al rol)`}
          </p>

          <div className="acciones-modal">
            <button type="button" className="secundario" onClick={onCerrar}>
              Cancelar
            </button>
            <button type="submit" className="primario" disabled={enviando || !rolId}>
              {enviando ? 'Guardando...' : usuario ? 'Guardar' : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
