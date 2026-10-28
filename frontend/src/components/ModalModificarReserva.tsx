import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { CalendarClock } from 'lucide-react';
import { api, type CambiosReserva, type CotizacionModificacion } from '../api/client';
import type { Habitacion } from '../api/types';
import { formatearDinero } from '../formato';
import { leerEdades } from '../logica/servicios';
import { CabeceraModal } from './CabeceraModal';
import { DesgloseTarifa } from './DesgloseTarifa';

// Lo que el modal necesita de la reserva (desde el listado o el calendario).
export interface ReservaAModificar {
  id: string;
  estado: string;
  fechaEntrada: string;
  fechaSalida: string;
  habitacionId: string;
  huesped: { nombre: string };
  // Desde el calendario no se conocen las personas: no se cambian.
  adultos?: number;
  edadesNinos?: number[];
}

interface Props {
  reserva: ReservaAModificar;
  // Lo que trae precargado (p. ej. la barra soltada en el calendario).
  inicial?: { fechaEntrada?: string; fechaSalida?: string; habitacionId?: string };
  // Conservar el precio o la tarifa por noche es del admin.
  esAdmin: boolean;
  onCerrar: () => void;
  onModificada: (mensaje: string) => void;
}

const dia = (iso: string) => iso.slice(0, 10);
const hoyLocal = () => new Date().toLocaleDateString('en-CA');

// "+ $260.000" / "− $40.000" / "Sin cambio de precio".
function textoDiferencia(diferencia: number) {
  if (diferencia === 0) return 'Sin cambio de precio';
  return `${diferencia > 0 ? '+' : '−'} ${formatearDinero(Math.abs(diferencia))}`;
}

// A-5 (R7): cambia fechas, habitación o personas de una reserva sin cancelarla.
// Cada cambio pide la cotización al backend (la misma regla que aplicará) y
// muestra la diferencia antes de confirmar.
export function ModalModificarReserva({
  reserva,
  inicial,
  esAdmin,
  onCerrar,
  onModificada,
}: Props) {
  const enCurso = reserva.estado === 'activa';
  const [fechaEntrada, setFechaEntrada] = useState(
    dia(inicial?.fechaEntrada ?? reserva.fechaEntrada),
  );
  const [fechaSalida, setFechaSalida] = useState(dia(inicial?.fechaSalida ?? reserva.fechaSalida));
  const [habitacionId, setHabitacionId] = useState(inicial?.habitacionId ?? reserva.habitacionId);
  const conPersonas = reserva.adultos !== undefined && !enCurso;
  const [adultos, setAdultos] = useState(reserva.adultos ?? 1);
  const [edadesTexto, setEdadesTexto] = useState((reserva.edadesNinos ?? []).join(', '));
  const [decisionHotel, setDecisionHotel] = useState(false);
  const [mantenerTarifa, setMantenerTarifa] = useState(false);
  const [habitaciones, setHabitaciones] = useState<Habitacion[]>([]);
  const [todas, setTodas] = useState<Habitacion[]>([]);
  const [cotizacion, setCotizacion] = useState<CotizacionModificacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const edades = leerEdades(edadesTexto);

  // Solo lo que cambió respecto de la reserva.
  const cambios = useMemo<CambiosReserva>(() => {
    const c: CambiosReserva = {};
    if (fechaEntrada !== dia(reserva.fechaEntrada)) c.fechaEntrada = fechaEntrada;
    if (fechaSalida !== dia(reserva.fechaSalida)) c.fechaSalida = fechaSalida;
    if (habitacionId !== reserva.habitacionId) c.habitacionId = habitacionId;
    if (conPersonas && adultos !== reserva.adultos) c.adultos = adultos;
    if (conPersonas && edades && edades.join() !== (reserva.edadesNinos ?? []).join()) {
      c.edadesNinos = edades;
    }
    if (decisionHotel && c.habitacionId) c.motivo = 'decision_hotel';
    if (mantenerTarifa) c.mantenerTarifaPorNoche = true;
    return c;
  }, [
    fechaEntrada,
    fechaSalida,
    habitacionId,
    adultos,
    edades,
    conPersonas,
    decisionHotel,
    mantenerTarifa,
    reserva,
  ]);
  const hayCambios = Object.keys(cambios).some(
    (k) => k !== 'motivo' && k !== 'mantenerTarifaPorNoche',
  );
  const clave = JSON.stringify(cambios);

  // Las habitaciones libres en las fechas nuevas, más la actual (su propia
  // reserva la hace aparecer como ocupada). Una estadía en curso solo puede
  // pasar a otra desde hoy.
  useEffect(() => {
    api
      .listarHabitaciones()
      .then(setTodas)
      .catch(() => setTodas([]));
  }, []);
  useEffect(() => {
    if (fechaSalida <= fechaEntrada) return;
    const desde = enCurso ? hoyLocal() : fechaEntrada;
    api
      .disponibles(desde, fechaSalida, conPersonas ? adultos : 1, conPersonas ? (edades ?? []) : [])
      .then(setHabitaciones)
      .catch(() => setHabitaciones([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechaEntrada, fechaSalida, adultos, edadesTexto, enCurso]);

  useEffect(() => {
    setError(null);
    if (!hayCambios) {
      setCotizacion(null);
      return;
    }
    let vigente = true;
    api
      .cotizarModificacion(reserva.id, cambios)
      .then((c) => vigente && setCotizacion(c))
      .catch((e) => {
        if (!vigente) return;
        setCotizacion(null);
        setError(e instanceof Error ? e.message : 'No se pudo cotizar el cambio');
      });
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, hayCambios, reserva.id]);

  async function confirmar(evento: FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      const r = await api.modificarReserva(reserva.id, cambios);
      onModificada(
        [
          `Reserva de ${reserva.huesped.nombre} modificada: ${textoDiferencia(r.diferencia).toLowerCase()}.`,
          r.penalidad > 0 &&
            `Penalidad por acortar: ${formatearDinero(r.penalidad)} (en el folio).`,
          r.saldoAFavor > 0 && `Queda un saldo a favor de ${formatearDinero(r.saldoAFavor)}.`,
        ]
          .filter(Boolean)
          .join(' '),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo modificar la reserva');
    } finally {
      setGuardando(false);
    }
  }

  const actual = todas.find((h) => h.id === reserva.habitacionId);
  const opciones = [
    ...(actual ? [actual] : []),
    ...habitaciones.filter((h) => h.id !== reserva.habitacionId),
  ];
  // La habitación elegida puede no estar libre (p. ej. soltada en el calendario).
  const elegidaNoLibre =
    habitacionId !== reserva.habitacionId && !habitaciones.some((h) => h.id === habitacionId);
  const conservadas = cotizacion?.desglose.noches.filter((n) => n.conservada).length ?? 0;

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <form className="modal modal-ancho" onClick={(e) => e.stopPropagation()} onSubmit={confirmar}>
        <CabeceraModal
          icono={CalendarClock}
          titulo={`Modificar la reserva de ${reserva.huesped.nombre}`}
        />
        {enCurso && (
          <p className="texto-secundario">
            La estadía está en curso: solo cambian la salida o la habitación.
          </p>
        )}

        <div className="fila-campos">
          <div className="campo">
            <label htmlFor="mod-entrada">Entrada</label>
            <input
              id="mod-entrada"
              type="date"
              value={fechaEntrada}
              disabled={enCurso}
              onChange={(e) => setFechaEntrada(e.target.value)}
            />
          </div>
          <div className="campo">
            <label htmlFor="mod-salida">Salida</label>
            <input
              id="mod-salida"
              type="date"
              value={fechaSalida}
              min={fechaEntrada}
              onChange={(e) => setFechaSalida(e.target.value)}
            />
          </div>
          <div className="campo crece">
            <label htmlFor="mod-habitacion">Habitación</label>
            <select
              id="mod-habitacion"
              value={habitacionId}
              onChange={(e) => setHabitacionId(e.target.value)}
            >
              {elegidaNoLibre && (
                <option value={habitacionId}>
                  {todas.find((h) => h.id === habitacionId)?.numero ?? 'Elegida'} (no está libre)
                </option>
              )}
              {opciones.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.numero} · {h.tipoHabitacion.nombre}
                  {h.id === reserva.habitacionId ? ' (actual)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {conPersonas && (
          <div className="fila-campos">
            <div className="campo">
              <label htmlFor="mod-adultos">Adultos</label>
              <input
                id="mod-adultos"
                type="number"
                min={1}
                value={adultos}
                onChange={(e) => setAdultos(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
            <div className="campo crece">
              <label htmlFor="mod-edades">Edades de los niños</label>
              <input
                id="mod-edades"
                placeholder="p. ej. 3, 8"
                value={edadesTexto}
                aria-invalid={edades === null}
                onChange={(e) => setEdadesTexto(e.target.value)}
              />
            </div>
          </div>
        )}

        {esAdmin && (
          <div className="fila-campos">
            {habitacionId !== reserva.habitacionId && (
              <label className="casilla">
                <input
                  type="checkbox"
                  checked={decisionHotel}
                  onChange={(e) => setDecisionHotel(e.target.checked)}
                />
                El hotel decide el cambio (se conserva el precio)
              </label>
            )}
            <label className="casilla">
              <input
                type="checkbox"
                checked={mantenerTarifa}
                onChange={(e) => setMantenerTarifa(e.target.checked)}
              />
              Noches nuevas a la tarifa media pactada
            </label>
          </div>
        )}

        {error && <div className="mensaje-error">{error}</div>}

        {cotizacion && (
          <div className="resultado-modificacion">
            <div
              className={`diferencia-precio ${cotizacion.diferencia > 0 ? 'sube' : cotizacion.diferencia < 0 ? 'baja' : ''}`}
            >
              <span>Diferencia</span>
              <strong>{textoDiferencia(cotizacion.diferencia)}</strong>
              <span className="texto-secundario">
                {formatearDinero(cotizacion.totalAnterior)} → {formatearDinero(cotizacion.total)}
              </span>
            </div>
            {cotizacion.penalidad > 0 && (
              <p className="texto-penalidad">
                Penalidad por acortar fuera del plazo gratuito:{' '}
                {formatearDinero(cotizacion.penalidad)} (queda en el folio).
              </p>
            )}
            <p className="texto-secundario">
              {conservadas > 0 &&
                `${conservadas} ${conservadas === 1 ? 'noche conserva' : 'noches conservan'} la tarifa pactada; las nuevas se cotizan hoy. `}
              {cotizacion.saldo < 0
                ? `Quedaría un saldo a favor del huésped de ${formatearDinero(-cotizacion.saldo)}.`
                : `Saldo después del cambio: ${formatearDinero(cotizacion.saldo)}.`}
            </p>
            <DesgloseTarifa desglose={cotizacion.desglose} />
          </div>
        )}

        <div className="acciones-modal">
          <button type="button" className="secundario" onClick={onCerrar}>
            Cancelar
          </button>
          <button className="primario" disabled={!cotizacion || guardando || edades === null}>
            {guardando ? 'Guardando...' : 'Confirmar el cambio'}
          </button>
        </div>
      </form>
    </div>
  );
}
