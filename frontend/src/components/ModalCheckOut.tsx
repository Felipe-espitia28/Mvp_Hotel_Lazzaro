import { Plus, Receipt, Trash2 } from 'lucide-react';
import { CabeceraModal } from './CabeceraModal';
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Folio, MedioPago, Reserva, Responsable } from '../api/types';
import { ETIQUETA_MEDIO_PAGO, formatearDinero } from '../formato';
import { useHotel } from '../contexto/HotelActual';
import {
  elRestoDe,
  lineasIniciales,
  puedeCerrarCuentas,
  saldosTras,
  saldoTras,
  type LineaPago,
  type Pendientes,
} from '../logica/pagos';

interface Props {
  reservaId: string;
  huesped: string;
  habitacion: string;
  // A-1: solo el admin cierra con saldo pendiente (cuenta por cobrar).
  puedeCerrarConSaldo: boolean;
  onCerrar: () => void;
  onLiquidada: (reserva: Reserva & { saldo: number }) => void;
}

// R23 / A-1: el check-out muestra la liquidación del folio y lo que falta por
// pagar; los pagos finales (uno o varios medios) deben dejar el saldo en 0.
export function ModalCheckOut({
  reservaId,
  huesped,
  habitacion,
  puedeCerrarConSaldo,
  onCerrar,
  onLiquidada,
}: Props) {
  const [folio, setFolio] = useState<Folio | null>(null);
  // Solo los medios de pago que el hotel recibe (sus políticas).
  const { hotel } = useHotel();
  const mediosPago: MedioPago[] = hotel?.politicas.mediosPago ?? [
    'efectivo',
    'tarjeta',
    'transferencia',
  ];
  const [lineas, setLineas] = useState<LineaPago[]>([]);
  const [cerrarConSaldo, setCerrarConSaldo] = useState(false);
  const [saldoAFavor, setSaldoAFavor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // R24: si se va antes de lo pactado, se cobran solo las noches usadas.
  const anticipada = folio?.salidaAnticipada;
  // B-5: lo pendiente de cada subcuenta si el check-out fuera ahora.
  const pendientes: Pendientes = folio
    ? {
        huesped: (folio.subcuentasACobrar ?? folio.subcuentas).huesped.saldo,
        empresa: (folio.subcuentasACobrar ?? folio.subcuentas).empresa.saldo,
      }
    : { huesped: 0, empresa: 0 };
  const pendiente = pendientes.huesped + pendientes.empresa;
  const empresa = folio?.empresa ?? null;
  const conCredito = !!empresa?.credito;

  useEffect(() => {
    api
      .folio(reservaId)
      .then((f) => {
        setFolio(f);
        // Lo más común: pagar todo lo pendiente con el primer medio (o
        // reembolsar lo que pagó de más). Lo de una empresa con crédito queda
        // por cobrar.
        const cuentas = f.subcuentasACobrar ?? f.subcuentas;
        setLineas(
          lineasIniciales(
            { huesped: cuentas.huesped.saldo, empresa: cuentas.empresa.saldo },
            mediosPago[0],
            !!f.empresa?.credito,
          ),
        );
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Error al cargar el folio'));
    // Los medios del hotel no cambian mientras el modal está abierto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservaId]);

  const cambiarLinea = (i: number, cambios: Partial<LineaPago>) =>
    setLineas((actuales) => actuales.map((l, j) => (j === i ? { ...l, ...cambios } : l)));
  const finales = saldosTras(pendientes, lineas);
  const final = finales.huesped + finales.empresa;
  const cuadra = puedeCerrarCuentas(pendientes, lineas, {
    cerrarConSaldo,
    saldoAFavor,
    empresaConCredito: conCredito,
  });
  // Lo que queda de la empresa a crédito no exige el permiso de cerrar con saldo.
  const faltaSinCredito = finales.huesped > 0 || (finales.empresa > 0 && !conCredito);

  async function confirmar() {
    setError(null);
    setEnviando(true);
    try {
      onLiquidada(
        await api.checkOut(reservaId, {
          pagos: lineas.map((l) => ({
            ...l,
            referencia: l.referencia?.trim() || undefined,
            responsable: empresa ? l.responsable : undefined,
          })),
          cerrarConSaldo: cerrarConSaldo || undefined,
          saldoAFavor: saldoAFavor || undefined,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo hacer el check-out');
      setEnviando(false);
    }
  }

  const vigentes = folio?.cargos.filter((c) => !c.anulado) ?? [];
  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <CabeceraModal icono={Receipt} titulo="Check-out" />
        <p className="texto-secundario">
          {huesped} · habitación {habitacion}
        </p>
        {error && <div className="mensaje-error">{error}</div>}
        {!folio ? (
          <p>Cargando liquidación...</p>
        ) : (
          <>
            {anticipada && (
              <div className="mensaje-aviso">
                Salida anticipada: se cobran {anticipada.nochesACobrar} de{' '}
                {anticipada.nochesPactadas} noches y las restantes quedan libres para vender.
              </div>
            )}
            <table className="desglose liquidacion">
              <tbody>
                <tr>
                  <td>
                    {anticipada
                      ? `Alojamiento (${anticipada.nochesACobrar} ${anticipada.nochesACobrar === 1 ? 'noche usada' : 'noches usadas'})`
                      : 'Alojamiento pactado'}
                    {anticipada && (
                      <div className="texto-secundario">
                        Pactado: {formatearDinero(folio.alojamiento)}
                      </div>
                    )}
                  </td>
                  <td className="monto">
                    {formatearDinero(anticipada?.alojamientoACobrar ?? folio.alojamiento)}
                  </td>
                </tr>
                {vigentes.map((c) => (
                  <tr key={c.id}>
                    <td>
                      {c.concepto} × {c.cantidad}
                    </td>
                    <td className="monto">{formatearDinero(c.total)}</td>
                  </tr>
                ))}
                {folio.pagado - folio.reembolsado !== 0 && (
                  <tr>
                    <td>Ya pagado (abonos)</td>
                    <td className="monto">−{formatearDinero(folio.pagado - folio.reembolsado)}</td>
                  </tr>
                )}
                <tr className="fila-total">
                  <td>{pendiente < 0 ? 'Saldo a favor' : 'Por pagar'}</td>
                  <td className="monto">{formatearDinero(Math.abs(pendiente))}</td>
                </tr>
              </tbody>
            </table>

            {pendiente === 0 && lineas.length === 0 && (
              <p className="texto-secundario">La cuenta ya está saldada con los abonos.</p>
            )}
            {empresa && (
              <div className="subcuentas-folio">
                {(['huesped', 'empresa'] as const).map((r) => (
                  <div key={r} className="subcuenta">
                    <span className="texto-secundario">
                      {r === 'huesped' ? 'Huésped' : empresa.razonSocial}
                    </span>
                    <strong>{formatearDinero(Math.abs(pendientes[r]))}</strong>
                    <span className="texto-secundario">
                      {pendientes[r] < 0
                        ? 'a favor'
                        : r === 'empresa' && conCredito && pendientes[r] > 0
                          ? `a crédito${empresa.diasCredito ? ` (${empresa.diasCredito} días)` : ''}`
                          : 'por pagar'}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {lineas.map((l, i) => (
              <div className="fila-campos fila-pago-final" key={i}>
                {empresa && (
                  <div className="campo">
                    <label htmlFor={`quien-${i}`}>Paga</label>
                    <select
                      id={`quien-${i}`}
                      value={l.responsable ?? 'huesped'}
                      onChange={(e) =>
                        cambiarLinea(i, { responsable: e.target.value as Responsable })
                      }
                    >
                      <option value="huesped">Huésped</option>
                      <option value="empresa">{empresa.razonSocial}</option>
                    </select>
                  </div>
                )}
                <div className="campo">
                  <label htmlFor={`medio-${i}`}>
                    {l.tipo === 'reembolso' ? 'Reembolsar con' : 'Medio de pago'}
                  </label>
                  <select
                    id={`medio-${i}`}
                    value={l.medio}
                    onChange={(e) => cambiarLinea(i, { medio: e.target.value as MedioPago })}
                  >
                    {mediosPago.map((valor) => (
                      <option key={valor} value={valor}>
                        {ETIQUETA_MEDIO_PAGO[valor]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="campo">
                  <label htmlFor={`monto-${i}`}>Monto</label>
                  <input
                    id={`monto-${i}`}
                    type="number"
                    min={0}
                    value={l.monto || ''}
                    onChange={(e) => cambiarLinea(i, { monto: Number(e.target.value) })}
                  />
                </div>
                <div className="campo">
                  <label htmlFor={`ref-${i}`}>Referencia</label>
                  <input
                    id={`ref-${i}`}
                    value={l.referencia ?? ''}
                    maxLength={60}
                    placeholder="Opcional"
                    onChange={(e) => cambiarLinea(i, { referencia: e.target.value })}
                  />
                </div>
                <div className="acciones-tabla">
                  <button
                    type="button"
                    className="enlace"
                    onClick={() => cambiarLinea(i, { monto: elRestoDe(pendientes, lineas, i) })}
                  >
                    El resto
                  </button>
                  <button
                    type="button"
                    className="enlace"
                    aria-label="Quitar este pago"
                    onClick={() => setLineas((actuales) => actuales.filter((_, j) => j !== i))}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
            {(pendientes.huesped > 0 || pendientes.empresa > 0) && (
              <button
                type="button"
                className="enlace"
                onClick={() =>
                  setLineas((actuales) => [
                    ...actuales,
                    {
                      tipo: 'abono',
                      medio: mediosPago[1] ?? mediosPago[0],
                      monto: Math.max(
                        0,
                        saldoTras(
                          pendientes.huesped,
                          actuales.filter((l) => (l.responsable ?? 'huesped') === 'huesped'),
                        ),
                      ),
                      responsable: 'huesped',
                    },
                  ])
                }
              >
                <Plus size={14} /> Pagar con otro medio
              </button>
            )}

            <p className={`resumen-pago ${final === 0 ? 'cuadra' : ''}`} aria-live="polite">
              {final === 0
                ? 'El saldo queda en $0.'
                : empresa
                  ? `Huésped: ${formatearDinero(finales.huesped)} · ${empresa.razonSocial}: ${formatearDinero(finales.empresa)}${
                      finales.empresa > 0 && conCredito ? ' (a crédito)' : ''
                    }.`
                  : final > 0
                    ? `Faltan ${formatearDinero(final)} por pagar.`
                    : `Quedan ${formatearDinero(-final)} a favor del huésped.`}
            </p>
            {faltaSinCredito && puedeCerrarConSaldo && (
              <label className="casilla">
                <input
                  type="checkbox"
                  checked={cerrarConSaldo}
                  onChange={(e) => setCerrarConSaldo(e.target.checked)}
                />
                Cerrar con saldo pendiente (queda en cuentas por cobrar)
              </label>
            )}
            {(finales.huesped < 0 || finales.empresa < 0) && (
              <label className="casilla">
                <input
                  type="checkbox"
                  checked={saldoAFavor}
                  onChange={(e) => setSaldoAFavor(e.target.checked)}
                />
                Dejar el saldo a favor del huésped (sin reembolsarlo ahora)
              </label>
            )}
            <p className="texto-secundario">
              Al confirmar se cierra el folio: no se podrán cargar más consumos.
            </p>
          </>
        )}
        <div className="acciones-modal">
          <button className="secundario" onClick={onCerrar}>
            Cancelar
          </button>
          <button className="acento" disabled={!folio || enviando || !cuadra} onClick={confirmar}>
            {enviando ? 'Liquidando...' : 'Confirmar check-out'}
          </button>
        </div>
      </div>
    </div>
  );
}
