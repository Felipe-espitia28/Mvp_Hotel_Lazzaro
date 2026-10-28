import { useState, type FormEvent } from 'react';
import { Lock } from 'lucide-react';
import { api } from '../api/client';
import type { Turno } from '../api/types';
import { formatearDinero, formatearFechaHora } from '../formato';
import { diferenciaCaja, leerMonto } from '../logica/caja';
import { CabeceraModal } from './CabeceraModal';
import { ResumenCaja } from './ResumenCaja';

// B-3: cierre del turno: los totales por medio, lo esperado en efectivo y lo
// contado, con la diferencia. Al cerrar, el resumen queda congelado.
export function ModalCerrarTurno({
  turno,
  onCerrar,
  onCerrado,
}: {
  turno: Turno;
  onCerrar: () => void;
  onCerrado: (cerrado: Turno) => void;
}) {
  const [contadoTexto, setContadoTexto] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const contado = leerMonto(contadoTexto);
  const cuadre = diferenciaCaja(contado, turno.resumen.esperadoEfectivo);

  async function cerrar(evento: FormEvent) {
    evento.preventDefault();
    if (contado === null) return;
    setGuardando(true);
    setError(null);
    try {
      onCerrado(await api.turnos.cerrar(turno.id, contado, observaciones.trim() || undefined));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cerrar el turno');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <form className="modal modal-ancho" onClick={(e) => e.stopPropagation()} onSubmit={cerrar}>
        <CabeceraModal
          icono={Lock}
          titulo={`Cerrar el turno abierto ${formatearFechaHora(turno.abiertoEn)}`}
        />
        <ResumenCaja resumen={turno.resumen} />
        <div className="fila-campos">
          <div className="campo">
            <label htmlFor="turno-contado">Efectivo contado</label>
            <input
              id="turno-contado"
              inputMode="decimal"
              placeholder="p. ej. 210.000"
              value={contadoTexto}
              aria-invalid={contadoTexto !== '' && contado === null}
              onChange={(e) => setContadoTexto(e.target.value)}
            />
          </div>
          {cuadre && (
            <div className={`diferencia-caja ${cuadre.tono}`} role="status">
              <strong>
                {cuadre.diferencia > 0 ? '+' : ''}
                {formatearDinero(cuadre.diferencia)}
              </strong>
              <span>{cuadre.texto}</span>
            </div>
          )}
        </div>
        <div className="campo">
          <label htmlFor="turno-observaciones">Observaciones</label>
          <textarea
            id="turno-observaciones"
            rows={2}
            maxLength={500}
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
          />
        </div>
        {error && <div className="mensaje-error">{error}</div>}
        <div className="acciones-modal">
          <button type="button" className="secundario" onClick={onCerrar}>
            Cancelar
          </button>
          <button className="primario" disabled={contado === null || guardando}>
            {guardando ? 'Cerrando...' : 'Cerrar el turno'}
          </button>
        </div>
      </form>
    </div>
  );
}
