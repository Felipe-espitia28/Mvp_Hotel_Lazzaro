import { Fragment, useCallback, useEffect, useState, type FormEvent } from 'react';
import { ChevronDown, History, LogIn, LogOut, Receipt, Search, UserX, Wine, X } from 'lucide-react';
import { iniciales } from '../components/Marca';
import { HistorialReserva } from '../components/HistorialReserva';
import { DesgloseTarifa } from '../components/DesgloseTarifa';
import { FolioReserva } from '../components/FolioReserva';
import { ModalCheckOut } from '../components/ModalCheckOut';
import { ModalCheckIn } from '../components/ModalCheckIn';
import { api, type FiltrosReservas } from '../api/client';
import type { EstadoReserva, Reserva } from '../api/types';
import { ETIQUETA_ESTADO, formatearDinero, formatearFecha, textoCancelacion } from '../formato';
import { resumenHuespedes } from '../logica/edades';
import { avisoCheckOut } from '../logica/pagos';

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
  // A-1: anular pagos y cerrar con saldo pendiente son del admin.
  puedeAnularPagos: boolean;
  puedeCerrarConSaldo: boolean;
  // Búsqueda con la que se abre (p. ej. desde "Datos por completar").
  buscarInicial?: string;
}

export function Reservas({
  puedeCargar,
  puedeAnularPagos,
  puedeCerrarConSaldo,
  buscarInicial,
}: Props) {
  const [checkInDe, setCheckInDe] = useState<Reserva | null>(null);
  const [checkOutDe, setCheckOutDe] = useState<Reserva | null>(null);
  const [versionHistorial, setVersionHistorial] = useState(0);
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [historialAbierto, setHistorialAbierto] = useState<string | null>(null);
  // Filtros aplicados y paginación (el listado completo puede tener miles).
  const [filtros, setFiltros] = useState<FiltrosReservas>({ pagina: 1, buscar: buscarInicial });
  const [textoBusqueda, setTextoBusqueda] = useState(buscarInicial ?? '');
  const [paginacion, setPaginacion] = useState({ total: 0, paginas: 1 });

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const pagina = await api.listarReservas(filtros);
      setReservas(pagina.datos);
      setPaginacion({ total: pagina.total, paginas: pagina.paginas });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar las reservas');
    } finally {
      setCargando(false);
    }
  }, [filtros]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function buscar(evento: FormEvent) {
    evento.preventDefault();
    setFiltros({ ...filtros, buscar: textoBusqueda.trim() || undefined, pagina: 1 });
  }

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
      // A-2: con anticipo, el resumen dice qué se aplicó y qué se devuelve; el
      // reembolso se registra en el folio de la reserva (que queda abierto).
      if (cancelada.anticipos > 0) {
        setHistorialAbierto(r.id);
        return [
          `Reserva cancelada. Penalidad ${formatearDinero(cancelada.penalidad)} · anticipo ${formatearDinero(cancelada.anticipos)} · a devolver ${formatearDinero(cancelada.aDevolver)}.`,
          cancelada.aDevolver > 0 &&
            'Registra el reembolso en el folio (o déjalo como saldo a favor).',
        ]
          .filter(Boolean)
          .join(' ');
      }
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

  const pagina = filtros.pagina ?? 1;

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
          <UserX size={16} /> Revisar no-shows
        </button>
      </div>
      {error && <div className="mensaje-error">{error}</div>}
      {aviso && <div className="mensaje-exito">{aviso}</div>}

      <form className="barra-busqueda" onSubmit={buscar}>
        <select
          aria-label="Filtrar por estado"
          value={filtros.estado ?? ''}
          onChange={(e) =>
            setFiltros({
              ...filtros,
              estado: (e.target.value || undefined) as EstadoReserva | undefined,
              pagina: 1,
            })
          }
        >
          <option value="">Todos los estados</option>
          {Object.entries(ETIQUETA_ESTADO).map(([valor, etiqueta]) => (
            <option key={valor} value={valor}>
              {etiqueta}
            </option>
          ))}
        </select>
        <input
          placeholder="Huésped, documento o habitación"
          value={textoBusqueda}
          onChange={(e) => setTextoBusqueda(e.target.value)}
        />
        <button className="primario">
          <Search size={16} /> Buscar
        </button>
      </form>

      {cargando && reservas.length === 0 ? (
        <p>Cargando...</p>
      ) : reservas.length === 0 ? (
        <p className="vacio">
          {filtros.estado || filtros.buscar
            ? 'No hay reservas con esos filtros.'
            : 'Aún no hay reservas.'}
        </p>
      ) : (
        <div className="contenedor-tabla">
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
                    <td>
                      <span className="numero-habitacion">{r.habitacion.numero}</span>
                    </td>
                    <td>
                      <div className="celda-huesped">
                        <span className="avatar claro">{iniciales(r.huesped.nombre)}</span>
                        {r.huesped.nombre}
                      </div>
                    </td>
                    <td>
                      {formatearFecha(r.fechaEntrada)} → {formatearFecha(r.fechaSalida)}
                      <div className="texto-secundario">
                        {r.noches} {r.noches === 1 ? 'noche' : 'noches'}
                      </div>
                    </td>
                    <td>
                      <span className={`badge-estado ${r.estado}`}>
                        {ETIQUETA_ESTADO[r.estado]}
                      </span>
                      {r.anticipoPendiente && (
                        <div className="etiqueta-atrasada">Anticipo pendiente</div>
                      )}
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
                              onClick={() => setCheckInDe(r)}
                            >
                              <LogIn size={14} /> Check-in
                            </button>
                            <button
                              className="peligro"
                              disabled={procesando === r.id}
                              onClick={() => cancelar(r)}
                            >
                              <X size={14} /> Cancelar
                            </button>
                          </>
                        )}
                        {r.estado === 'activa' && (
                          <button
                            className="secundario"
                            disabled={procesando === r.id}
                            onClick={() => setCheckOutDe(r)}
                          >
                            <LogOut size={14} /> Check-out
                          </button>
                        )}
                        <button
                          className="enlace"
                          aria-expanded={historialAbierto === r.id}
                          onClick={() =>
                            setHistorialAbierto(historialAbierto === r.id ? null : r.id)
                          }
                        >
                          {historialAbierto === r.id ? 'Ocultar' : 'Detalle'}
                          <ChevronDown
                            size={14}
                            className={historialAbierto === r.id ? 'girado' : undefined}
                          />
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
                              <Receipt size={15} /> Precio pactado (
                              {resumenHuespedes(r.adultos, r.edadesNinos)})
                            </h4>
                            {r.desglose ? (
                              <DesgloseTarifa desglose={r.desglose} />
                            ) : (
                              <p className="texto-secundario">
                                Reserva anterior al motor de tarifas: sin desglose.
                              </p>
                            )}
                          </div>
                          {/* A-2: en toda reserva: antes de llegar (anticipos) y después de cancelar (devolución). */}
                          <div>
                            <h4>
                              <Wine size={15} /> Folio (consumos y pagos)
                            </h4>
                            <FolioReserva
                              key={r.id + r.estado}
                              reservaId={r.id}
                              puedeCargar={puedeCargar}
                              puedeAnularPagos={puedeAnularPagos}
                              onCambio={() => setVersionHistorial((v) => v + 1)}
                            />
                          </div>
                          <div>
                            <h4>
                              <History size={15} /> Historial
                            </h4>
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
        </div>
      )}

      {paginacion.total > 0 && (
        <div className="paginacion">
          <button
            className="secundario"
            disabled={pagina <= 1 || cargando}
            onClick={() => setFiltros({ ...filtros, pagina: pagina - 1 })}
          >
            ← Anterior
          </button>
          <span className="texto-secundario">
            Página {pagina} de {paginacion.paginas} · {paginacion.total}{' '}
            {paginacion.total === 1 ? 'reserva' : 'reservas'}
          </span>
          <button
            className="secundario"
            disabled={pagina >= paginacion.paginas || cargando}
            onClick={() => setFiltros({ ...filtros, pagina: pagina + 1 })}
          >
            Siguiente →
          </button>
        </div>
      )}

      {checkInDe && (
        <ModalCheckIn
          reserva={checkInDe}
          onCerrar={() => setCheckInDe(null)}
          onHecho={async ({ avisos }) => {
            setCheckInDe(null);
            setError(null);
            setAviso([`Check-in de ${checkInDe.huesped.nombre} registrado.`, ...avisos].join(' '));
            await cargar();
          }}
        />
      )}

      {checkOutDe && (
        <ModalCheckOut
          reservaId={checkOutDe.id}
          huesped={checkOutDe.huesped.nombre}
          habitacion={checkOutDe.habitacion.numero}
          puedeCerrarConSaldo={puedeCerrarConSaldo}
          onCerrar={() => setCheckOutDe(null)}
          onLiquidada={async (cerrada) => {
            setCheckOutDe(null);
            setError(null);
            setAviso(avisoCheckOut(checkOutDe.huesped.nombre, cerrada));
            await cargar();
          }}
        />
      )}
    </div>
  );
}
