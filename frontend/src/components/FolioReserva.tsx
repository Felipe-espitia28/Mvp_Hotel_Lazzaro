import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api/client';
import type { CategoriaCargo, Folio, MedioPago, ProductoConsumo } from '../api/types';
import { useHotel } from '../contexto/HotelActual';
import {
  ETIQUETA_CATEGORIA,
  ETIQUETA_MEDIO_PAGO,
  ETIQUETA_TIPO_PAGO,
  formatearDinero,
  formatearFechaHora,
} from '../formato';
import { estadoSaldo } from '../logica/pagos';

interface Props {
  reservaId: string;
  // Recepción y admin cargan consumos (solo con la estadía activa, R21) y registran abonos.
  puedeCargar: boolean;
  // A-1: anular un pago es una corrección contable: solo el admin.
  puedeAnularPagos: boolean;
  // Avisa que el folio cambió (p. ej. para refrescar el historial).
  onCambio?: () => void;
}

const TEXTO_SALDO = {
  debe: 'Saldo pendiente',
  saldado: 'Cuenta saldada',
  'a-favor': 'Saldo a favor del huésped',
} as const;

// Folio (R20–R23, A-1): consumos y pagos de la estadía, con el saldo arriba.
export function FolioReserva({ reservaId, puedeCargar, puedeAnularPagos, onCambio }: Props) {
  const [folio, setFolio] = useState<Folio | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Catálogo del hotel ('' = consumo con valor libre).
  const [productos, setProductos] = useState<ProductoConsumo[]>([]);
  const [productoId, setProductoId] = useState('');
  const [categoria, setCategoria] = useState<CategoriaCargo>('restaurante');
  const [concepto, setConcepto] = useState('');
  const [cantidad, setCantidad] = useState(1);
  const [valorUnitario, setValorUnitario] = useState('');
  const [enviando, setEnviando] = useState(false);
  // Abono o reembolso: solo los medios que el hotel recibe.
  const { hotel } = useHotel();
  const mediosPago: MedioPago[] = hotel?.politicas.mediosPago ?? ['efectivo'];
  const [medio, setMedio] = useState<MedioPago>(mediosPago[0]);
  const [montoPago, setMontoPago] = useState('');
  const [referencia, setReferencia] = useState('');

  useEffect(() => {
    api
      .folio(reservaId)
      .then(setFolio)
      .catch((e) => setError(e instanceof Error ? e.message : 'Error al cargar el folio'));
  }, [reservaId]);

  const abiertoParaCargar = folio?.estado === 'activa' && puedeCargar;
  useEffect(() => {
    if (!abiertoParaCargar) return;
    api
      .productos()
      .then((lista) => {
        const activos = lista.filter((p) => p.activo);
        setProductos(activos);
        setProductoId((actual) => actual || activos[0]?.id || '');
      })
      .catch(() => setProductos([])); // Sin catálogo se cargan con valor libre.
  }, [abiertoParaCargar]);

  const producto = productos.find((p) => p.id === productoId);

  async function actualizar(accion: () => Promise<Folio>, mensaje: string) {
    setError(null);
    try {
      setFolio(await accion());
      onCambio?.();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : mensaje);
      return false;
    }
  }

  async function cargar(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    const hecho = await actualizar(
      () =>
        api.agregarCargo(
          reservaId,
          producto
            ? { productoId: producto.id, cantidad }
            : { categoria, concepto, cantidad, valorUnitario: Number(valorUnitario) },
        ),
      'No se pudo cargar el consumo',
    );
    if (hecho) {
      setConcepto('');
      setCantidad(1);
      setValorUnitario('');
    }
    setEnviando(false);
  }

  async function pagar(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    const hecho = await actualizar(
      () =>
        api.registrarPago(reservaId, {
          tipo: folio!.saldo < 0 ? 'reembolso' : 'abono',
          medio,
          monto: Number(montoPago),
          referencia: referencia.trim() || undefined,
        }),
      'No se pudo registrar el pago',
    );
    if (hecho) {
      setMontoPago('');
      setReferencia('');
    }
    setEnviando(false);
  }

  async function anularCargo(cargoId: string, nombre: string) {
    const motivo = window.prompt(`¿Por qué se anula "${nombre}"? (queda en la auditoría)`);
    if (motivo) {
      await actualizar(
        () => api.anularCargo(reservaId, cargoId, motivo),
        'No se pudo anular el cargo',
      );
    }
  }

  async function anularPago(pagoId: string, nombre: string) {
    const motivo = window.prompt(`¿Por qué se anula el ${nombre}? (queda en la auditoría)`);
    if (motivo) {
      await actualizar(
        () => api.anularPago(reservaId, pagoId, motivo),
        'No se pudo anular el pago',
      );
    }
  }

  if (!folio)
    return error ? <div className="mensaje-error">{error}</div> : <p>Cargando folio...</p>;

  const abierto = folio.estado === 'activa';
  const estado = estadoSaldo(folio.saldo);
  // Con la estadía activa se abona siempre; después del cierre, solo lo que
  // quedó pendiente, o se reembolsa un saldo a favor.
  const puedePagar = puedeCargar && (abierto || estado !== 'saldado');
  return (
    <div>
      {error && <div className="mensaje-error">{error}</div>}

      <div className={`saldo-folio ${estado}`} aria-live="polite">
        <span>{TEXTO_SALDO[estado]}</span>
        <strong>{formatearDinero(Math.abs(folio.saldo))}</strong>
        <span className="texto-secundario">
          {abierto ? 'Total en curso' : 'Total liquidado'} {formatearDinero(folio.total)} · pagado{' '}
          {formatearDinero(folio.pagado - folio.reembolsado)}
        </span>
      </div>

      {folio.movimientos.length === 0 ? (
        <p className="texto-secundario">Sin consumos ni pagos registrados.</p>
      ) : (
        <table className="desglose">
          <tbody>
            {folio.movimientos.map((m) =>
              m.clase === 'cargo' ? (
                <tr key={m.registro.id} className={m.registro.anulado ? 'cargo-anulado' : ''}>
                  <td>
                    {m.registro.concepto} × {m.registro.cantidad}
                    <div className="texto-secundario">
                      {ETIQUETA_CATEGORIA[m.registro.categoria]} · {formatearFechaHora(m.fecha)} ·{' '}
                      {m.registro.usuario.nombre}
                      {m.registro.anulado && ` · Anulado: ${m.registro.motivoAnulacion}`}
                    </div>
                  </td>
                  <td className="monto">{formatearDinero(m.registro.total)}</td>
                  <td>
                    {abierto && puedeCargar && !m.registro.anulado && (
                      <button
                        className="enlace"
                        onClick={() => anularCargo(m.registro.id, m.registro.concepto)}
                      >
                        Anular
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                <tr
                  key={m.registro.id}
                  className={`fila-pago ${m.registro.anulado ? 'cargo-anulado' : ''}`}
                >
                  <td>
                    {ETIQUETA_TIPO_PAGO[m.registro.tipo]} · {ETIQUETA_MEDIO_PAGO[m.registro.medio]}
                    {m.registro.referencia && ` · ref. ${m.registro.referencia}`}
                    <div className="texto-secundario">
                      {formatearFechaHora(m.fecha)} · {m.registro.usuario?.nombre ?? 'Sistema'}
                      {m.registro.anulado &&
                        ` · Anulado por ${m.registro.anuladoPor?.nombre ?? '—'}: ${m.registro.motivoAnulacion}`}
                    </div>
                  </td>
                  <td className="monto">
                    {m.registro.tipo === 'reembolso' ? '+' : '−'}
                    {formatearDinero(m.registro.monto)}
                  </td>
                  <td>
                    {puedeAnularPagos && !m.registro.anulado && (
                      <button
                        className="enlace"
                        onClick={() =>
                          anularPago(
                            m.registro.id,
                            ETIQUETA_TIPO_PAGO[m.registro.tipo].toLowerCase(),
                          )
                        }
                      >
                        Anular
                      </button>
                    )}
                  </td>
                </tr>
              ),
            )}
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
            <td>{abierto ? 'Total en curso' : 'Total liquidado'}</td>
            <td className="monto">{formatearDinero(folio.total)}</td>
          </tr>
        </tbody>
      </table>

      {puedePagar && (
        <form className="form-cargo" onSubmit={pagar}>
          <select
            aria-label="Medio de pago"
            value={medio}
            onChange={(e) => setMedio(e.target.value as MedioPago)}
          >
            {mediosPago.map((m) => (
              <option key={m} value={m}>
                {ETIQUETA_MEDIO_PAGO[m]}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            aria-label="Monto"
            placeholder="Monto"
            value={montoPago}
            onChange={(e) => setMontoPago(e.target.value)}
            required
          />
          <input
            aria-label="Referencia"
            placeholder="Referencia (opcional)"
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            maxLength={60}
          />
          <button className="secundario" disabled={enviando || !(Number(montoPago) > 0)}>
            {folio.saldo < 0 ? 'Registrar reembolso' : 'Registrar abono'}
          </button>
        </form>
      )}

      {abierto && puedeCargar && (
        <form className="form-cargo" onSubmit={cargar}>
          <select
            aria-label="Consumo"
            value={productoId}
            onChange={(e) => setProductoId(e.target.value)}
          >
            {(Object.keys(ETIQUETA_CATEGORIA) as CategoriaCargo[]).map((cat) => {
              const delGrupo = productos.filter((p) => p.categoria === cat);
              return delGrupo.length === 0 ? null : (
                <optgroup key={cat} label={ETIQUETA_CATEGORIA[cat]}>
                  {delGrupo.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} · {formatearDinero(p.precio)}
                    </option>
                  ))}
                </optgroup>
              );
            })}
            <option value="">Otro consumo (valor libre)</option>
          </select>
          {!producto && (
            <>
              <select
                aria-label="Categoría"
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
            </>
          )}
          <input
            type="number"
            min={1}
            aria-label="Cantidad"
            value={cantidad}
            onChange={(e) => setCantidad(Math.max(1, Number(e.target.value) || 1))}
          />
          {!producto && (
            <input
              type="number"
              min={1}
              placeholder="Valor unitario"
              value={valorUnitario}
              onChange={(e) => setValorUnitario(e.target.value)}
              required
            />
          )}
          <button className="primario" disabled={enviando}>
            {enviando
              ? 'Cargando...'
              : producto
                ? `Cargar ${formatearDinero(Number(producto.precio) * cantidad)}`
                : 'Cargar a la habitación'}
          </button>
        </form>
      )}
    </div>
  );
}
