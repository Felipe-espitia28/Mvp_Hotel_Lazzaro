import { Receipt } from 'lucide-react';
import { CabeceraModal } from './CabeceraModal';
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Folio, MedioPago, Reserva } from '../api/types';
import { ETIQUETA_MEDIO_PAGO, formatearDinero } from '../formato';

interface Props {
  reservaId: string;
  huesped: string;
  habitacion: string;
  onCerrar: () => void;
  onLiquidada: (reserva: Reserva) => void;
}

// R23: el check-out muestra la liquidación del folio y registra el medio de pago.
export function ModalCheckOut({ reservaId, huesped, habitacion, onCerrar, onLiquidada }: Props) {
  const [folio, setFolio] = useState<Folio | null>(null);
  const [medioPago, setMedioPago] = useState<MedioPago>('efectivo');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api
      .folio(reservaId)
      .then(setFolio)
      .catch((e) => setError(e instanceof Error ? e.message : 'Error al cargar el folio'));
  }, [reservaId]);

  async function confirmar() {
    setError(null);
    setEnviando(true);
    try {
      onLiquidada(await api.checkOut(reservaId, medioPago));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo hacer el check-out');
      setEnviando(false);
    }
  }

  const vigentes = folio?.cargos.filter((c) => !c.anulado) ?? [];
  // R24: si se va antes de lo pactado, se cobran solo las noches usadas.
  const anticipada = folio?.salidaAnticipada;
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
                <tr className="fila-total">
                  <td>Total a pagar</td>
                  <td className="monto">
                    {formatearDinero(anticipada?.totalACobrar ?? folio.total)}
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="campo">
              <label htmlFor="medio-pago">Medio de pago</label>
              <select
                id="medio-pago"
                value={medioPago}
                onChange={(e) => setMedioPago(e.target.value as MedioPago)}
              >
                {Object.entries(ETIQUETA_MEDIO_PAGO).map(([valor, etiqueta]) => (
                  <option key={valor} value={valor}>
                    {etiqueta}
                  </option>
                ))}
              </select>
            </div>
            <p className="texto-secundario">
              Al confirmar se cierra el folio: no se podrán cargar más consumos.
            </p>
          </>
        )}
        <div className="acciones-modal">
          <button className="secundario" onClick={onCerrar}>
            Cancelar
          </button>
          <button className="acento" disabled={!folio || enviando} onClick={confirmar}>
            {enviando ? 'Liquidando...' : 'Confirmar check-out'}
          </button>
        </div>
      </div>
    </div>
  );
}
