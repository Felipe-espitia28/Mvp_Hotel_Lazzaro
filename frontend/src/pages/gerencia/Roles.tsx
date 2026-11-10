import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Copy, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { api } from '../../api/client';
import type { CatalogoPermisos, Permiso, RolHotel } from '../../api/types';
import { EditorRol } from '../../components/EditorRol';

// Plan 19: los roles del hotel (Gerencia → Equipo → Roles). Todos se editan,
// también el Administrador; el servidor cuida que siempre quede alguien que
// gestione el equipo y los roles (R78).
export function Roles({ puedeDar }: { puedeDar: Permiso[] }) {
  const [roles, setRoles] = useState<RolHotel[]>([]);
  const [catalogo, setCatalogo] = useState<CatalogoPermisos | null>(null);
  const [editando, setEditando] = useState<{ rol?: RolHotel; base?: RolHotel } | null>(null);
  const [eliminando, setEliminando] = useState<RolHotel | null>(null);
  const [reasignarA, setReasignarA] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [lista, cat] = await Promise.all([api.roles.listar(), api.roles.catalogo()]);
      setRoles(lista);
      setCatalogo(cat);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los roles');
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function eliminar() {
    if (!eliminando) return;
    setError(null);
    try {
      await api.roles.eliminar(eliminando.id, reasignarA || undefined);
      setAviso(`Rol ${eliminando.nombre} eliminado.`);
      setEliminando(null);
      setReasignarA('');
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar el rol');
    }
  }

  return (
    <div>
      <div className="barra-titulo">
        <h2>Roles del hotel</h2>
        <button className="acento" onClick={() => setEditando({})} disabled={!catalogo}>
          <Plus size={16} /> Nuevo rol
        </button>
      </div>
      {error && <div className="mensaje-error">{error}</div>}
      {aviso && <div className="mensaje-exito">{aviso}</div>}

      <div className="grid-roles">
        {roles.map((r) => (
          <article key={r.id} className="tarjeta tarjeta-rol">
            <h3 className="tarjeta-titulo">
              <ShieldCheck size={18} /> {r.nombre}
            </h3>
            {r.descripcion && <p className="texto-secundario">{r.descripcion}</p>}
            <p>
              {r.personas ?? 0} persona(s) · {r.permisos.length} permiso(s)
              {(r.sensibles ?? 0) > 0 && (
                <span className="marca-sensible" title="Incluye permisos sensibles">
                  {' '}
                  <AlertTriangle size={13} /> {r.sensibles} sensible(s)
                </span>
              )}
            </p>
            <div className="acciones-tarjeta">
              <button className="enlace" onClick={() => setEditando({ rol: r })}>
                <Pencil size={14} /> Editar
              </button>
              <button className="enlace" onClick={() => setEditando({ base: r })}>
                <Copy size={14} /> Duplicar
              </button>
              <button
                className="enlace"
                onClick={() => {
                  setEliminando(r);
                  setReasignarA('');
                }}
              >
                <Trash2 size={14} /> Eliminar
              </button>
            </div>
          </article>
        ))}
      </div>

      {eliminando && (
        <div className="modal-fondo" onClick={() => setEliminando(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Eliminar el rol {eliminando.nombre}</h3>
            {(eliminando.personas ?? 0) > 0 ? (
              <div className="campo">
                <label htmlFor="rol-reasignar">
                  Tiene {eliminando.personas} persona(s). ¿A qué rol se mueven?
                </label>
                <select
                  id="rol-reasignar"
                  value={reasignarA}
                  onChange={(e) => setReasignarA(e.target.value)}
                >
                  <option value="">Elige un rol</option>
                  {roles
                    .filter((r) => r.id !== eliminando.id)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.nombre}
                      </option>
                    ))}
                </select>
              </div>
            ) : (
              <p className="texto-secundario">Nadie tiene este rol.</p>
            )}
            <div className="acciones-modal">
              <button className="secundario" onClick={() => setEliminando(null)}>
                Cancelar
              </button>
              <button
                className="peligro"
                disabled={(eliminando.personas ?? 0) > 0 && !reasignarA}
                onClick={eliminar}
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {editando && catalogo && (
        <EditorRol
          rol={editando.rol}
          base={editando.base}
          catalogo={catalogo}
          puedeDar={puedeDar}
          onCerrar={() => setEditando(null)}
          onGuardado={(mensaje) => {
            setEditando(null);
            setAviso(mensaje);
            cargar();
          }}
        />
      )}
    </div>
  );
}
