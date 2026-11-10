import { useEffect, useState, type FormEvent } from 'react';
import { ShieldCheck } from 'lucide-react';
import { api } from '../api/client';
import type { CatalogoPermisos, Permiso, RolHotel, VistaPreviaRol } from '../api/types';
import { CabeceraModal } from './CabeceraModal';
import { SelectorPermisos } from './SelectorPermisos';

// Plan 19: crear, duplicar o editar un rol del hotel. Antes de guardar un rol
// con personas se muestra a quién afecta y si dejaría al hotel sin quien
// gestione su equipo y sus roles (R78).
export function EditorRol({
  rol,
  base,
  catalogo,
  puedeDar,
  onCerrar,
  onGuardado,
}: {
  // Para editar.
  rol?: RolHotel;
  // Para crear a partir de otro (duplicar).
  base?: RolHotel;
  catalogo: CatalogoPermisos;
  puedeDar: Permiso[];
  onCerrar: () => void;
  onGuardado: (mensaje: string) => void;
}) {
  const [nombre, setNombre] = useState(rol?.nombre ?? (base ? `${base.nombre} (copia)` : ''));
  const [descripcion, setDescripcion] = useState(rol?.descripcion ?? base?.descripcion ?? '');
  const [permisos, setPermisos] = useState<Permiso[]>(rol?.permisos ?? base?.permisos ?? []);
  const [vista, setVista] = useState<VistaPreviaRol | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // La vista previa se pide al cambiar los permisos de un rol existente.
  useEffect(() => {
    if (!rol) return;
    const pausa = setTimeout(() => {
      api.roles
        .vistaPrevia(rol.id, permisos)
        .then(setVista)
        .catch(() => setVista(null));
    }, 300);
    return () => clearTimeout(pausa);
  }, [rol, permisos]);

  const etiqueta = (clave: Permiso) =>
    catalogo.permisos.find((e) => e.clave === clave)?.etiqueta ?? clave;

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      if (rol) {
        const r = await api.roles.actualizar(rol.id, { nombre, descripcion, permisos });
        onGuardado(
          `Rol ${r.nombre} guardado${r.personasAfectadas ? `: aplica ya a ${r.personasAfectadas} persona(s)` : ''}.`,
        );
      } else {
        const r = await api.roles.crear({
          nombre,
          descripcion: descripcion || undefined,
          permisos,
        });
        onGuardado(`Rol ${r.nombre} creado.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el rol');
      setEnviando(false);
    }
  }

  const cambio = vista && (vista.ganan.length > 0 || vista.pierden.length > 0);
  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <form className="modal modal-ancho" onClick={(e) => e.stopPropagation()} onSubmit={guardar}>
        <CabeceraModal
          icono={ShieldCheck}
          titulo={rol ? `Editar el rol ${rol.nombre}` : 'Nuevo rol'}
        />
        <div className="fila-campos">
          <div className="campo">
            <label htmlFor="rol-nombre">Nombre</label>
            <input
              id="rol-nombre"
              value={nombre}
              maxLength={60}
              required
              placeholder="p. ej. Jefe de recepción"
              onChange={(e) => setNombre(e.target.value)}
            />
          </div>
          <div className="campo crece">
            <label htmlFor="rol-descripcion">Descripción</label>
            <input
              id="rol-descripcion"
              value={descripcion}
              maxLength={300}
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </div>
        </div>
        <SelectorPermisos
          catalogo={catalogo}
          seleccion={permisos}
          onCambio={setPermisos}
          puedeDar={[...new Set([...puedeDar, ...(rol?.permisos ?? [])])]}
        />
        {cambio && (
          <div className={vista.rompeGobierno ? 'mensaje-error' : 'mensaje-aviso'}>
            Este cambio afecta a {vista.personasAfectadas} persona(s)
            {vista.ganan.length > 0 && `: ganan ${vista.ganan.map(etiqueta).join(', ')}`}
            {vista.pierden.length > 0 &&
              `${vista.ganan.length > 0 ? ';' : ':'} pierden ${vista.pierden.map(etiqueta).join(', ')}`}
            .{vista.rompeGobierno && ` ${vista.motivo}`}
          </div>
        )}
        {error && <div className="mensaje-error">{error}</div>}
        <div className="acciones-modal">
          <button type="button" className="secundario" onClick={onCerrar}>
            Cancelar
          </button>
          <button className="primario" disabled={enviando || !!vista?.rompeGobierno}>
            {enviando ? 'Guardando...' : 'Guardar rol'}
          </button>
        </div>
      </form>
    </div>
  );
}
