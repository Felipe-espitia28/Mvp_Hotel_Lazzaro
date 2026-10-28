import { useState, type FormEvent } from 'react';
import { Building, Plus, Search, X } from 'lucide-react';
import { api } from '../api/client';
import type { Empresa, EmpresaResumen, ReglaEmpresa } from '../api/types';
import { formatearNit } from '../logica/empresas';
import { ModalEmpresa } from './ModalEmpresa';

export interface EmpresaElegida {
  empresa: EmpresaResumen | null;
  regla: ReglaEmpresa;
}

// B-5: "Factura a empresa": buscar la empresa por NIT o nombre, elegir qué
// paga (el alojamiento o todo) o quitarla. El admin también puede crearla.
export function SelectorEmpresa({
  valor,
  onCambio,
  puedeCrear,
  deshabilitado = false,
}: {
  valor: EmpresaElegida;
  onCambio: (valor: EmpresaElegida) => void;
  puedeCrear: boolean;
  deshabilitado?: boolean;
}) {
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState<Empresa[] | null>(null);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buscar(evento?: FormEvent) {
    evento?.preventDefault();
    setError(null);
    try {
      setResultados(await api.empresas.buscar(texto.trim() || undefined));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo buscar');
    }
  }

  function elegir(empresa: EmpresaResumen) {
    setResultados(null);
    setTexto('');
    onCambio({ empresa, regla: valor.regla });
  }

  if (valor.empresa) {
    return (
      <div className="selector-empresa">
        <div className="empresa-elegida">
          <Building size={16} />
          <span>
            <strong>{valor.empresa.razonSocial}</strong> · NIT {formatearNit(valor.empresa.nit)}
            {valor.empresa.credito && ' · con crédito'}
          </span>
          {!deshabilitado && (
            <button
              type="button"
              className="enlace"
              aria-label="Quitar la empresa"
              onClick={() => onCambio({ empresa: null, regla: 'alojamiento' })}
            >
              <X size={14} /> Quitar
            </button>
          )}
        </div>
        <div className="campo">
          <label htmlFor="regla-empresa">La empresa paga</label>
          <select
            id="regla-empresa"
            value={valor.regla}
            disabled={deshabilitado}
            onChange={(e) => onCambio({ ...valor, regla: e.target.value as ReglaEmpresa })}
          >
            <option value="alojamiento">El alojamiento (los consumos, el huésped)</option>
            <option value="todo">Todo (alojamiento y consumos)</option>
          </select>
        </div>
      </div>
    );
  }

  return (
    <div className="selector-empresa">
      <form className="fila-campos" onSubmit={buscar}>
        <div className="campo crece">
          <label htmlFor="buscar-empresa">Factura a empresa (NIT o nombre)</label>
          <input
            id="buscar-empresa"
            value={texto}
            disabled={deshabilitado}
            placeholder="p. ej. 900.123.456 o Viajes"
            onChange={(e) => setTexto(e.target.value)}
          />
        </div>
        <button type="submit" className="secundario" disabled={deshabilitado}>
          <Search size={15} /> Buscar
        </button>
        {puedeCrear && (
          <button
            type="button"
            className="enlace"
            disabled={deshabilitado}
            onClick={() => setCreando(true)}
          >
            <Plus size={14} /> Crear empresa
          </button>
        )}
      </form>
      {error && <div className="mensaje-error">{error}</div>}
      {resultados &&
        (resultados.length === 0 ? (
          <p className="texto-secundario">
            No hay empresas con ese NIT o nombre
            {puedeCrear ? '.' : ': pídele al administrador que la cree.'}
          </p>
        ) : (
          <ul className="lista-opciones">
            {resultados.map((e) => (
              <li key={e.id}>
                <button type="button" className="enlace" onClick={() => elegir(e)}>
                  {e.razonSocial} · NIT {formatearNit(e.nit, e.digitoVerificacion)}
                  {e.credito && ' · con crédito'}
                </button>
              </li>
            ))}
          </ul>
        ))}
      {creando && (
        <ModalEmpresa
          onCerrar={() => setCreando(false)}
          onGuardada={(empresa) => {
            setCreando(false);
            elegir(empresa);
          }}
        />
      )}
    </div>
  );
}
