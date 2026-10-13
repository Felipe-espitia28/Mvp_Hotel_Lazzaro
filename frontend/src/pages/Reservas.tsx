import { Fragment, useEffect, useState } from 'react';
import { HistorialReserva } from '../components/HistorialReserva';
import { DesgloseTarifa } from '../components/DesgloseTarifa';
import { FolioReserva } from '../components/FolioReserva';
import { ModalCheckOut } from '../components/ModalCheckOut';
import { api } from '../api/client';
import type { Reserva } from '../api/types';
import { ETIQUETA_ESTADO, formatearDinero, formatearFecha, textoCancelacion } from '../formato';

// Qué se cobró o se debe, según el estado de la reserva.
function DetalleValor({ reserva }: { reserva: Reserva }) {
  const { estado, total, valorAlojamiento } = reserva;

  if (estado === 'cerrada') {
    return <strong>{formatearDinero(total ?? valorAlojamiento)}</strong>;
  }
  if (estado === 'cancelada' || estado === 'no_show') {
    return Number(total) > 0 ? (
      <span className="texto-penalidad">Penalidad {formatearDinero(total!)}</span>
    ) : (
      <span className="texto-secundario">Sin costo</span>
    );
  }
  // Confirmada o activa: el precio pactado que se cobrará al salir.
  return <span>{formatearDinero(valorAlojamiento)}</span>;
}

interface Props {
  // Recepción y admin cargan consumos al folio.
  puedeCargar: boolean;
}

export function Reservas({ puedeCargar }: Props) {
  const [checkOutDe, setCheckOutDe] = useState<Reserva | null>(null);
  const [versionHistorial, setVersionHistorial] = useState(0);
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [historialAbierto, setHistorialAbierto] = useState<string | null>(null);

  async function cargar() {
    setCargando(true);
    try {
      setReservas(await api.listarReservas());
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  // Ejecuta una acción sobre una reserva, refresca la lista y muestra el resultado.
  async function ejecutar(id: string, accion: () => Promise<string | null>) {
    setError(null);
    setAviso(null);
    setProcesando(id);
    try {
      setAviso(await accion());
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ocurrió un error');
    } finally {
      setProcesando(null);
    }
  }

  function cancelar(r: Reserva) {
    const esGratuita = new Date() <= new Date(r.cancelacionGratuitaHasta);
    const pregunta = esGratuita
      ? `¿Cancelar la reserva de ${r.huesped.nombre}? La cancelación es gratuita.`
      : `¿Cancelar la reserva de ${r.huesped.nombre}? Ya pasó el plazo de cancelación gratuita: se cobrará una noche de penalidad.`;
    if (!window.confirm(pregunta)) return;

    ejecutar(r.id, async () => {
      const cancelada = await api.cancelar(r.id);
      return Number(cancelada.total) > 0
        ? `Reserva cancelada con penalidad de ${formatearDinero(cancelada.total!)}.`
        : 'Reserva cancelada sin costo.';
    });
  }

  function revisarNoShows() {
    ejecutar('no-shows', async () => {
      const { marcadas } = await api.procesarNoShows();
      return marcadas.length === 0
        ? 'No hay reservas vencidas.'
        : `${marcadas.length} reserva(s) marcadas como no-show; sus noches quedaron libres.`;
    });
  }

  if (cargando) return <p>Cargando...</p>;

  return (
    <div>
      <div className="barra-titulo">
        <h2>Reservas</h2>
        <button
          className="secundario"
          disabled={procesando === 'no-shows'}
          onClick={revisarNoShows}
          title="El sistema lo hace solo cada 10 minutos"
        >
          Revisar no-shows
        </button>
      </div>
      {error && <div className="mensaje-error">{error}</div>}
      {aviso && <div className="mensaje-exito">{aviso}</div>}

      {reservas.length === 0 ? (
        <p className="vacio">Aún no hay reservas.</p>
      ) : (
        <table className="tabla">
          <thead>
            <tr>
              <th>Habitación</th>
              <th>Huésped</th>
              <th>Estadía</th>
              <th>Estado</th>
              <th>Valor</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {reservas.map((r) => (
              <Fragment key={r.id}>
                <tr>
                  <td>{r.habitacion.numero}</td>
                  <td>{r.huesped.nombre}</td>
                  <td>
                    {formatearFecha(r.fechaEntrada)} → {formatearFecha(r.fechaSalida)}
                    <div className="texto-secundario">
                      {r.noches} {r.noches === 1 ? 'noche' : 'noches'}
                    </div>
                  </td>
                  <td>
                    <span className={`badge-estado ${r.estado}`}>{ETIQUETA_ESTADO[r.estado]}</span>
                  </td>
                  <td>
                    <DetalleValor reserva={r} />
                    {r.estado === 'confirmada' && (
                      <div className="texto-secundario">
                        {textoCancelacion(r.cancelacionGratuitaHasta)}
                      </div>
                    )}
                  </td>
                  <td>
                    <div className="acciones-tabla">
                      {r.estado === 'confirmada' && (
                        <>
                          <button
                            className="primario"
                            disabled={procesando === r.id}
                            onClick={() =>
                              ejecutar(r.id, async () => {
                                await api.checkIn(r.id);
                                return `Check-in de ${r.huesped.nombre} registrado.`;
                              })
                            }
                          >
                            Check-in
                          </button>
                          <button
                            className="peligro"
                            disabled={procesando === r.id}
                            onClick={() => cancelar(r)}
                          >
                            Cancelar
                          </button>
                        </>
                      )}
                      {r.estado === 'activa' && (
                        <button
                          className="secundario"
                          disabled={procesando === r.id}
                          onClick={() => setCheckOutDe(r)}
                        >
                          Check-out
                        </button>
                      )}
                      <button
                        className="enlace"
                        onClick={() => setHistorialAbierto(historialAbierto === r.id ? null : r.id)}
                      >
                        {historialAbierto === r.id ? 'Ocultar detalle' : 'Detalle'}
                      </button>
                    </div>
                  </td>
                </tr>
                {historialAbierto === r.id && (
                  <tr className="fila-historial">
                    <td colSpan={6}>
                      <div className="detalle-reserva">
                        <div>
                          <h4>
                            Precio pactado ({r.numeroHuespedes}{' '}
                            {r.numeroHuespedes === 1 ? 'huésped' : 'huéspedes'})
                          </h4>
                          {r.desglose ? (
                            <DesgloseTarifa desglose={r.desglose} />
                          ) : (
                            <p className="texto-secundario">
                              Reserva anterior al motor de tarifas: sin desglose.
                            </p>
                          )}
                        </div>
                        {(r.estado === 'activa' || r.estado === 'cerrada') && (
                          <div>
                            <h4>Folio (consumos)</h4>
                            <FolioReserva
                              key={r.id + r.estado}
                              reservaId={r.id}
                              puedeCargar={puedeCargar}
                              onCambio={() => setVersionHistorial((v) => v + 1)}
                            />
                          </div>
                        )}
                        <div>
                          <h4>Historial</h4>
                          {/* La key recarga el historial tras cada acción o movimiento del folio. */}
                          <HistorialReserva
                            key={`${r.id}-${r.estado}-${versionHistorial}`}
                            reservaId={r.id}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}

      {checkOutDe && (
        <ModalCheckOut
          reservaId={checkOutDe.id}
          huesped={checkOutDe.huesped.nombre}
          habitacion={checkOutDe.habitacion.numero}
          onCerrar={() => setCheckOutDe(null)}
          onLiquidada={async (cerrada) => {
            setCheckOutDe(null);
            setError(null);
            setAviso(
              `Check-out de ${checkOutDe.huesped.nombre}: total ${formatearDinero(cerrada.total!)}.`,
            );
            await cargar();
          }}
        />
      )}
    </div>
  );
}
