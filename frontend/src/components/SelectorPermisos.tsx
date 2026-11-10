import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { CatalogoPermisos, Permiso } from '../api/types';
import { desmarcar, marcar, type Origen } from '../logica/permisos';

const TEXTO_ORIGEN: Record<Exclude<Origen, null>, string> = {
  rol: 'del rol',
  agregado: 'agregado',
  quitado: 'quitado',
};

// Plan 19: los permisos agrupados por área, con su explicación. Lo usan el
// editor de roles y el de una persona. Marcar uno marca lo que necesita;
// desmarcarlo avisa qué se desmarcó con él. Lo que quien edita no tiene no
// se puede dar (R76): aparece deshabilitado.
export function SelectorPermisos({
  catalogo,
  seleccion,
  onCambio,
  puedeDar,
  origenDe,
}: {
  catalogo: CatalogoPermisos;
  seleccion: Permiso[];
  onCambio: (seleccion: Permiso[]) => void;
  // null: puede dar todo (la Consola Lazaro).
  puedeDar: Permiso[] | null;
  // En el editor de una persona: de dónde sale cada permiso.
  origenDe?: (clave: Permiso) => Origen;
}) {
  const [aviso, setAviso] = useState<string | null>(null);
  const etiqueta = (clave: Permiso) =>
    catalogo.permisos.find((e) => e.clave === clave)?.etiqueta ?? clave;
  const bloqueado = (clave: Permiso) =>
    puedeDar !== null && !puedeDar.includes(clave) && !seleccion.includes(clave);

  function alternar(clave: Permiso, marcado: boolean) {
    if (marcado) {
      const nueva = marcar(seleccion, clave, catalogo.permisos);
      const sinPoder = nueva.filter((p) => !seleccion.includes(p) && bloqueado(p));
      if (sinPoder.length > 0) {
        setAviso(`Necesita "${sinPoder.map(etiqueta).join('", "')}", que no puedes otorgar.`);
        return;
      }
      setAviso(null);
      onCambio(nueva);
    } else {
      const { seleccion: nueva, arrastrados } = desmarcar(seleccion, clave, catalogo.permisos);
      setAviso(
        arrastrados.length > 0
          ? `También se desmarcó "${arrastrados.map(etiqueta).join('", "')}": necesita "${etiqueta(clave)}".`
          : null,
      );
      onCambio(nueva);
    }
  }

  return (
    <div className="selector-permisos">
      {aviso && <div className="mensaje-aviso">{aviso}</div>}
      {catalogo.grupos.map((grupo) => {
        const delGrupo = catalogo.permisos.filter((e) => e.grupo === grupo);
        if (delGrupo.length === 0) return null;
        const todos = delGrupo.every((e) => seleccion.includes(e.clave));
        const disponibles = delGrupo.filter((e) => !bloqueado(e.clave));
        return (
          <fieldset key={grupo} className="grupo-permisos">
            <legend>
              {grupo}{' '}
              <button
                type="button"
                className="enlace"
                disabled={disponibles.length === 0}
                onClick={() => {
                  let nueva = seleccion;
                  for (const e of disponibles) {
                    nueva = todos
                      ? desmarcar(nueva, e.clave, catalogo.permisos).seleccion
                      : marcar(nueva, e.clave, catalogo.permisos);
                  }
                  setAviso(null);
                  onCambio(nueva.filter((p) => !bloqueado(p) || seleccion.includes(p)));
                }}
              >
                {todos ? 'Quitar todo' : 'Seleccionar todo'}
              </button>
            </legend>
            {delGrupo.map((e) => {
              const origen = origenDe?.(e.clave) ?? null;
              const sinPoder = bloqueado(e.clave);
              return (
                <label
                  key={e.clave}
                  className={`permiso ${sinPoder ? 'sin-poder' : ''}`}
                  title={sinPoder ? 'No puedes otorgar un permiso que no tienes' : undefined}
                >
                  <input
                    type="checkbox"
                    checked={seleccion.includes(e.clave)}
                    disabled={sinPoder}
                    onChange={(ev) => alternar(e.clave, ev.target.checked)}
                  />
                  <span>
                    <strong>
                      {e.etiqueta}
                      {e.sensible && (
                        <AlertTriangle
                          size={13}
                          className="icono-sensible"
                          aria-label="Permiso sensible"
                        />
                      )}
                    </strong>
                    {origen && <span className={`origen ${origen}`}>{TEXTO_ORIGEN[origen]}</span>}
                    <span className="texto-secundario">{e.descripcion}</span>
                    {sinPoder && (
                      <span className="texto-secundario">
                        No puedes otorgar un permiso que no tienes.
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </fieldset>
        );
      })}
      {catalogo.permisos.some((e) => e.sensible) && (
        <p className="texto-secundario">
          <AlertTriangle size={13} className="icono-sensible" /> Sensible: da poder sobre el dinero,
          el equipo o la configuración del hotel.
        </p>
      )}
    </div>
  );
}
