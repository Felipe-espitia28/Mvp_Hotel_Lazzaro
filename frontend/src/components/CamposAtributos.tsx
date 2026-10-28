import type { DefinicionAtributo, ValorAtributo } from '../api/types';

interface Props {
  definiciones: DefinicionAtributo[];
  valores: Record<string, ValorAtributo>;
  onCambiar: (clave: string, valor: ValorAtributo | undefined) => void;
}

// S-1 (R54): los campos propios de una categoría, generados a partir de sus
// definiciones. Un campo vacío se manda sin valor (el backend no lo guarda).
export function CamposAtributos({ definiciones, valores, onCambiar }: Props) {
  if (definiciones.length === 0) return null;
  return (
    <div className="fila-campos">
      {definiciones.map((d) => {
        const id = `atributo-${d.clave}`;
        const valor = valores[d.clave];
        const etiqueta = `${d.etiqueta}${d.obligatorio ? ' *' : ''}`;
        if (d.tipo === 'si_no') {
          return (
            <label key={d.id} className="casilla campo">
              <input
                type="checkbox"
                checked={valor === true}
                onChange={(e) => onCambiar(d.clave, e.target.checked)}
              />
              {d.etiqueta}
            </label>
          );
        }
        return (
          <div key={d.id} className="campo">
            <label htmlFor={id}>{etiqueta}</label>
            {d.tipo === 'lista' ? (
              <select
                id={id}
                value={typeof valor === 'string' ? valor : ''}
                required={d.obligatorio}
                onChange={(e) => onCambiar(d.clave, e.target.value || undefined)}
              >
                <option value="">—</option>
                {d.opciones.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={id}
                type={d.tipo === 'numero' ? 'number' : 'text'}
                value={valor === undefined ? '' : String(valor)}
                required={d.obligatorio}
                maxLength={200}
                onChange={(e) => {
                  const texto = e.target.value;
                  if (texto.trim() === '') onCambiar(d.clave, undefined);
                  else onCambiar(d.clave, d.tipo === 'numero' ? Number(texto) : texto);
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
