import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api/client';
import type { CategoriaCargo, Folio } from '../api/types';
import {
  ETIQUETA_CATEGORIA,
  ETIQUETA_MEDIO_PAGO,
  formatearDinero,
  formatearFechaHora,
} from '../formato';

interface Props {
  reservaId: string;
  // Recepción y admin cargan consumos; solo mientras la estadía está activa (R21).
  puedeCargar: boolean;
  // Avisa que el folio cambió (p. ej. para refrescar el historial).
  onCambio?: () => void;
}

// Folio (R20–R23): consumos de la estadía y total en curso.
export function FolioReserva({ reservaId, puedeCargar, onCambio }: Props) {
  const [folio, setFolio] = useState<Folio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [categoria, setCategoria] = useState<CategoriaCargo>('minibar');
  const [concepto, setConcepto] = useState('');
  const [cantidad, setCantidad] = useState(1);
  const [valorUnitario, setValorUnitario] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api
      .folio(reservaId)
      .then(setFolio)
      .catch((e) => setError(e instanceof Error ? e.message : 'Error al cargar el folio'));
  }, [reservaId]);

  async function cargar(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      setFolio(
        await api.agregarCargo(reservaId, {
          categoria,
          concepto,
          cantidad,
          valorUnitario: Number(valorUnitario),
        }),
      );
      setConcepto('');
      setCantidad(1);
      setValorUnitario('');
      onCambio?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el consumo');
    } finally {
      setEnviando(false);
    }
  }

  async function anular(cargoId: string, nombre: string) {
    const motivo = window.prompt(`¿Por qué se anula "${nombre}"? (queda en la auditoría)`);
    if (!motivo) return;
    setError(null);
    try {
      setFolio(await api.anularCargo(reservaId, cargoId, motivo));
      onCambio?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo anular el cargo');
    }
  }

  if (!folio)
    return error ? <div className="mensaje-error">{error}</div> : <p>Cargando folio...</p>;

  const abierto = folio.estado === 'activa';
  return (
    <div>
      {error && <div className="mensaje-error">{error}</div>}
      {folio.cargos.length === 0 ? (
        <p className="texto-secundario">Sin consumos cargados.</p>
      ) : (
        <table className="desglose">
          <tbody>
            {folio.cargos.map((c) => (
              <tr key={c.id} className={c.anulado ? 'cargo-anulado' : ''}>
                <td>
                  {c.concepto} × {c.cantidad}
                  <div className="texto-secundario">
                    {ETIQUETA_CATEGORIA[c.categoria]} · {formatearFechaHora(c.fecha)} ·{' '}
                    {c.usuario.nombre}
                    {c.anulado && ` · Anulado: ${c.motivoAnulacion}`}
                  </div>
                </td>
                <td className="monto">{formatearDinero(c.total)}</td>
                {abierto && puedeCargar && (
                  <td>
                    {!c.anulado && (
                      <button className="enlace" onClick={() => anular(c.id, c.concepto)}>
                        Anular
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <table className="desglose">
        <tbody>
          <tr>
            <td>Alojamiento pactado</td>
            <td className="monto">{formatearDinero(folio.alojamiento)}</td>
          </tr>
          <tr>
            <td>Consumos</td>
            <td className="monto">{formatearDinero(folio.consumos)}</td>
          </tr>
          <tr className="fila-total">
            <td>
              {abierto ? 'Total en curso' : 'Total liquidado'}
              {folio.medioPago && (
                <span className="texto-secundario"> · {ETIQUETA_MEDIO_PAGO[folio.medioPago]}</span>
              )}
            </td>
            <td className="monto">{formatearDinero(folio.total)}</td>
          </tr>
        </tbody>
      </table>

      {abierto && puedeCargar && (
        <form className="form-cargo" onSubmit={cargar}>
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value as CategoriaCargo)}
          >
            {Object.entries(ETIQUETA_CATEGORIA).map(([valor, etiqueta]) => (
              <option key={valor} value={valor}>
                {etiqueta}
              </option>
            ))}
          </select>
          <input
            placeholder="Concepto"
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            required
          />
          <input
            type="number"
            min={1}
            aria-label="Cantidad"
            value={cantidad}
            onChange={(e) => setCantidad(Math.max(1, Number(e.target.value) || 1))}
          />
          <input
            type="number"
            min={1}
            placeholder="Valor unitario"
            value={valorUnitario}
            onChange={(e) => setValorUnitario(e.target.value)}
            required
          />
          <button className="primario" disabled={enviando}>
            {enviando ? 'Cargando...' : 'Cargar a la habitación'}
          </button>
        </form>
      )}
    </div>
  );
}
