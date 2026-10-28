import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { CalendarClock, ChevronLeft, ChevronRight, Mountain, Sparkles } from 'lucide-react';
import { api } from '../api/client';
import type {
  AgendaDelDia,
  CitaServicio,
  EstadoCita,
  QuienToma,
  SalidaExperiencia,
  Servicio,
} from '../api/types';
import { useHotel } from '../contexto/HotelActual';
import { formatearDinero, formatearFecha, formatearFechaHora } from '../formato';
import { sumarDias } from '../logica/calendario';
import {
  ETIQUETA_ESTADO_CITA,
  franjaOcupada,
  franjasDelDia,
  instanteDelHotel,
  minutoDelHotel,
  textoHora,
  transicionesDe,
  ubicarCita,
} from '../logica/agenda';
import { precioEstimado } from '../logica/servicios';
import { CabeceraModal } from '../components/CabeceraModal';
import { CamposPersonas, PERSONAS_INICIALES, quienesDe } from '../components/CamposPersonas';
import { QuienTomaServicio } from '../components/QuienTomaServicio';

type Vista = 'dia' | 'salidas';
type QuienSinPersonas = Pick<QuienToma, 'reservaId' | 'huesped' | 'pago'>;

const hoyLocal = () => new Date().toLocaleDateString('en-CA');
const INICIO_GRILLA = 7 * 60;
const FIN_GRILLA = 21 * 60;

// S-2: la agenda del spa (citas por recurso) y las salidas de las experiencias.
export function Agenda() {
  const [vista, setVista] = useState<Vista>('dia');
  return (
    <div>
      <div className="barra-titulo">
        <h2>Agenda de servicios</h2>
      </div>
      <div className="pestanas" role="tablist" aria-label="Vistas de la agenda">
        {(
          [
            ['dia', 'Citas del día', Sparkles],
            ['salidas', 'Salidas y cupos', Mountain],
          ] as const
        ).map(([id, titulo, Icono]) => (
          <button
            key={id}
            role="tab"
            aria-selected={vista === id}
            className={`pestana ${vista === id ? 'activa' : ''}`}
            onClick={() => setVista(id)}
          >
            <Icono size={16} /> {titulo}
          </button>
        ))}
      </div>
      <div role="tabpanel">{vista === 'dia' ? <AgendaDia /> : <Salidas />}</div>
    </div>
  );
}

// ── Día: columnas = recursos, filas = franjas de 15 minutos ─────────────

function AgendaDia() {
  const [fecha, setFecha] = useState(hoyLocal);
  const [datos, setDatos] = useState<AgendaDelDia | null>(null);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [nueva, setNueva] = useState<{ recursoId: string; minuto: number } | null>(null);
  const [abierta, setAbierta] = useState<CitaServicio | null>(null);

  const cargar = useCallback(async () => {
    try {
      setDatos(await api.agenda.delDia(fecha));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar la agenda');
    }
  }, [fecha]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    api
      .servicios()
      .then((s) => setServicios(s.filter((x) => x.tipo === 'cita' && x.activo)))
      .catch(() => setServicios([]));
  }, []);

  const recursos = datos?.recursos.filter((r) => r.activo) ?? [];
  const franjas = franjasDelDia(INICIO_GRILLA, FIN_GRILLA);
  const columnas = `64px repeat(${Math.max(recursos.length, 1)}, minmax(140px, 1fr))`;

  return (
    <div>
      <div className="barra-titulo">
        <div className="acciones-tabla">
          <button className="secundario" onClick={() => setFecha(sumarDias(fecha, -1))}>
            <ChevronLeft size={16} /> Anterior
          </button>
          <input
            type="date"
            aria-label="Día"
            value={fecha}
            onChange={(e) => e.target.value && setFecha(e.target.value)}
          />
          <button className="secundario" onClick={() => setFecha(sumarDias(fecha, 1))}>
            Siguiente <ChevronRight size={16} />
          </button>
        </div>
      </div>
      {error && <div className="mensaje-error">{error}</div>}
      {aviso && <div className="mensaje-exito">{aviso}</div>}

      {datos && recursos.length === 0 ? (
        <p className="vacio">
          El hotel aún no tiene cabinas ni terapeutas: se crean en Gerencia del hotel → Servicios.
        </p>
      ) : (
        datos && (
          <div className="calendario-contenedor">
            <div className="agenda-grilla" style={{ gridTemplateColumns: columnas }}>
              <div className="celda-encabezado esquina">Hora</div>
              {recursos.map((r, i) => (
                <div key={r.id} className="celda-encabezado" style={{ gridColumn: i + 2 }}>
                  {r.nombre}
                </div>
              ))}
              {franjas.map((minuto, fila) => (
                <Fragment key={minuto}>
                  <div className="agenda-hora" style={{ gridRow: fila + 2 }}>
                    {minuto % 60 === 0 ? textoHora(minuto) : ''}
                  </div>
                  {recursos.map((r, i) => {
                    const citas = datos.citas.filter((c) => c.recurso.id === r.id);
                    const libre = !franjaOcupada(minuto, citas);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        className={`agenda-franja ${libre ? 'libre' : ''}`}
                        style={{ gridRow: fila + 2, gridColumn: i + 2 }}
                        disabled={!libre}
                        aria-label={`${r.nombre} a las ${textoHora(minuto)}: ${libre ? 'agendar' : 'ocupado'}`}
                        onClick={() => {
                          setAviso(null);
                          setNueva({ recursoId: r.id, minuto });
                        }}
                      />
                    );
                  })}
                </Fragment>
              ))}
              {datos.citas.map((c) => {
                const columna = recursos.findIndex((r) => r.id === c.recurso.id);
                if (columna < 0) return null;
                const { fila, franjas: alto } = ubicarCita(c, INICIO_GRILLA);
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`agenda-cita cita-${c.estado}`}
                    style={{ gridColumn: columna + 2, gridRow: `${fila} / span ${alto}` }}
                    onClick={() => setAbierta(c)}
                    title={`${c.servicio.nombre} · ${c.huesped.nombre} · ${ETIQUETA_ESTADO_CITA[c.estado]}`}
                  >
                    <strong>
                      {textoHora(minutoDelHotel(c.inicio))} {c.servicio.nombre}
                    </strong>
                    <span>
                      {c.huesped.nombre}
                      {c.reserva && ` · Hab. ${c.reserva.habitacion.numero}`}
                    </span>
                    <span className="agenda-estado">{ETIQUETA_ESTADO_CITA[c.estado]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )
      )}
      <p className="texto-secundario">
        Haz clic en un espacio libre para agendar. Cada cita deja libre la cabina después del margen
        de limpieza del hotel.
      </p>

      {nueva && datos && (
        <ModalAgendarCita
          fecha={fecha}
          minuto={nueva.minuto}
          recurso={datos.recursos.find((r) => r.id === nueva.recursoId)!}
          servicios={servicios}
          onCerrar={() => setNueva(null)}
          onAgendada={async (cita) => {
            setNueva(null);
            setAviso(
              `Cita agendada: ${cita.concepto} a las ${textoHora(minutoDelHotel(cita.inicio))}.`,
            );
            await cargar();
          }}
        />
      )}
      {abierta && (
        <ModalCita
          cita={abierta}
          onCerrar={() => setAbierta(null)}
          onCambio={async (mensaje) => {
            setAbierta(null);
            setAviso(mensaje);
            await cargar();
          }}
        />
      )}
    </div>
  );
}

function ModalAgendarCita({
  fecha,
  minuto,
  recurso,
  servicios,
  onCerrar,
  onAgendada,
}: {
  fecha: string;
  minuto: number;
  recurso: AgendaDelDia['recursos'][number];
  servicios: Servicio[];
  onCerrar: () => void;
  onAgendada: (cita: CitaServicio) => void;
}) {
  const { hotel } = useHotel();
  const delRecurso = servicios.filter((s) => recurso.servicios.some((x) => x.servicio.id === s.id));
  const [servicioId, setServicioId] = useState(delRecurso[0]?.id ?? '');
  const [personas, setPersonas] = useState(PERSONAS_INICIALES);
  const [quien, setQuien] = useState<QuienSinPersonas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const servicio = delRecurso.find((s) => s.id === servicioId);
  const quienes = servicio ? quienesDe(servicio.modoPrecio, personas) : null;

  const estimado = useMemo(() => {
    if (!servicio || !hotel) return null;
    return precioEstimado(
      servicio,
      {
        cantidad: personas.cantidad,
        adultos: personas.adultos,
        edadesNinos: quienes?.edadesNinos ?? [],
      },
      {
        gratisHasta: hotel.politicas.edadMaximaNinoGratis,
        ninoHasta: hotel.politicas.edadMaximaNino,
      },
    );
  }, [servicio, hotel, personas, quienes]);

  async function confirmar(evento: FormEvent) {
    evento.preventDefault();
    if (!servicio || !quien || !quienes) return;
    setGuardando(true);
    setError(null);
    try {
      onAgendada(
        await api.agenda.agendar({
          servicioId,
          recursoId: recurso.id,
          inicio: instanteDelHotel(fecha, minuto),
          ...quien,
          ...quienes,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo agendar la cita');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <form className="modal modal-ancho" onClick={(e) => e.stopPropagation()} onSubmit={confirmar}>
        <CabeceraModal
          icono={CalendarClock}
          titulo={`${recurso.nombre} · ${formatearFecha(fecha)} a las ${textoHora(minuto)}`}
        />
        {delRecurso.length === 0 ? (
          <p className="vacio">Este recurso no presta ningún servicio de cita activo.</p>
        ) : (
          <>
            <div className="campo">
              <label htmlFor="cita-servicio">Servicio</label>
              <select
                id="cita-servicio"
                value={servicioId}
                onChange={(e) => setServicioId(e.target.value)}
              >
                {delRecurso.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre} · {s.duracionMinutos} min
                  </option>
                ))}
              </select>
            </div>
            {servicio && (
              <CamposPersonas modo={servicio.modoPrecio} valor={personas} onCambio={setPersonas} />
            )}
            <QuienTomaServicio onCambio={setQuien} />
            {estimado !== null && (
              <p>
                Valor: <strong>{formatearDinero(estimado)}</strong>
              </p>
            )}
          </>
        )}
        {error && <div className="mensaje-error">{error}</div>}
        <div className="acciones-modal">
          <button type="button" className="secundario" onClick={onCerrar}>
            Cancelar
          </button>
          <button className="primario" disabled={!servicio || !quien || !quienes || guardando}>
            {guardando ? 'Agendando...' : 'Agendar'}
          </button>
        </div>
      </form>
    </div>
  );
}

const ACCION_ESTADO: Record<Exclude<EstadoCita, 'agendada'>, string> = {
  en_curso: 'Empezar',
  realizada: 'Marcar realizada',
  cancelada: 'Cancelar la cita',
  no_asistio: 'No asistió',
};

function ModalCita({
  cita,
  onCerrar,
  onCambio,
}: {
  cita: CitaServicio;
  onCerrar: () => void;
  onCambio: (mensaje: string) => void;
}) {
  const { hotel } = useHotel();
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const medios = hotel?.politicas.mediosPago ?? ['efectivo'];
  // Sin folio (externo o sin estadía activa) y sin cobrar aún: se paga al prestarla.
  const sinFolio = cita.reserva?.estado !== 'activa';
  const [medio, setMedio] = useState(medios[0]);

  async function cambiar(estado: Exclude<EstadoCita, 'agendada'>) {
    if (
      (estado === 'cancelada' || estado === 'no_asistio') &&
      !window.confirm(`¿${ACCION_ESTADO[estado]}? Puede aplicar la penalidad del hotel.`)
    ) {
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await api.agenda.cambiarEstado(
        cita.id,
        estado,
        estado === 'realizada' && sinFolio ? { medio } : undefined,
      );
      onCambio(`${cita.concepto}: ${ETIQUETA_ESTADO_CITA[estado].toLowerCase()}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar la cita');
    } finally {
      setGuardando(false);
    }
  }

  const acciones = transicionesDe(cita.estado);
  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <CabeceraModal icono={CalendarClock} titulo={cita.concepto} />
        <p>
          {cita.recurso.nombre} · {formatearFechaHora(cita.inicio)} a{' '}
          {textoHora(minutoDelHotel(cita.fin))}
        </p>
        <p>
          {cita.huesped.nombre}
          {cita.reserva ? ` · Hab. ${cita.reserva.habitacion.numero}` : ' · cliente externo'} ·{' '}
          {formatearDinero(cita.valor)}
        </p>
        <p>
          <span className={`badge-estado cita-${cita.estado}`}>
            {ETIQUETA_ESTADO_CITA[cita.estado]}
          </span>{' '}
          {cita.cargoId && <span className="texto-secundario">En el folio</span>}
        </p>
        {acciones.includes('realizada') && sinFolio && (
          <div className="campo">
            <label htmlFor="cita-medio">Si aún no se pagó, medio del pago al prestarla</label>
            <select
              id="cita-medio"
              value={medio}
              onChange={(e) => setMedio(e.target.value as typeof medio)}
            >
              {medios.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        )}
        {error && <div className="mensaje-error">{error}</div>}
        <div className="acciones-modal">
          <button type="button" className="secundario" onClick={onCerrar}>
            Cerrar
          </button>
          {acciones.map((estado) => (
            <button
              key={estado}
              type="button"
              className={
                estado === 'cancelada' || estado === 'no_asistio' ? 'secundario' : 'primario'
              }
              disabled={guardando}
              onClick={() => cambiar(estado)}
            >
              {ACCION_ESTADO[estado]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Salidas de las experiencias ─────────────────────────────────────────

function Salidas() {
  const [salidas, setSalidas] = useState<SalidaExperiencia[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [tomando, setTomando] = useState<SalidaExperiencia | null>(null);

  const cargar = useCallback(async () => {
    try {
      setSalidas(await api.agenda.salidas(hoyLocal()));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar las salidas');
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function accion(hacer: () => Promise<unknown>, mensaje: string) {
    setError(null);
    setAviso(null);
    try {
      await hacer();
      setAviso(mensaje);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la acción');
    }
  }

  if (!salidas) return error ? <div className="mensaje-error">{error}</div> : <p>Cargando...</p>;
  return (
    <div>
      {error && <div className="mensaje-error">{error}</div>}
      {aviso && <div className="mensaje-exito">{aviso}</div>}
      {salidas.length === 0 ? (
        <p className="vacio">
          No hay salidas programadas en los próximos días. Se crean en Gerencia del hotel →
          Servicios.
        </p>
      ) : (
        <div className="lista-salidas">
          {salidas.map((s) => (
            <section key={s.id} className="tarjeta">
              <div className="barra-titulo">
                <h3 className="tarjeta-titulo">
                  <Mountain size={18} /> {s.servicio.nombre} · {formatearFechaHora(s.inicio)}
                </h3>
                <span className={`badge-estado salida-${s.estado}`}>{s.estado}</span>
              </div>
              <div
                className="barra-cupos"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={s.cupos}
                aria-valuenow={s.ocupados}
                aria-label="Cupos ocupados"
              >
                <div style={{ width: `${(s.ocupados / s.cupos) * 100}%` }} />
              </div>
              <p className="texto-secundario">
                {s.ocupados} de {s.cupos} cupos ocupados · {s.libres} libres
              </p>
              {s.tomados.filter((c) => c.estado === 'vigente').length > 0 && (
                <ul className="lista-cupos">
                  {s.tomados
                    .filter((c) => c.estado === 'vigente')
                    .map((c) => (
                      <li key={c.id}>
                        {c.huesped.nombre}
                        {c.reserva ? ` · Hab. ${c.reserva.habitacion.numero}` : ' · externo'} ·{' '}
                        {c.personas} {c.personas === 1 ? 'persona' : 'personas'} ·{' '}
                        {formatearDinero(c.valor)}
                        {s.estado === 'programada' && (
                          <button
                            type="button"
                            className="enlace"
                            onClick={() =>
                              window.confirm(`¿Cancelar el cupo de ${c.huesped.nombre}?`) &&
                              accion(() => api.agenda.cancelarCupo(c.id), 'Cupo cancelado.')
                            }
                          >
                            Cancelar
                          </button>
                        )}
                      </li>
                    ))}
                </ul>
              )}
              {s.estado === 'programada' && (
                <div className="acciones-tabla">
                  <button
                    className="primario"
                    disabled={s.libres === 0}
                    onClick={() => setTomando(s)}
                  >
                    Tomar cupo
                  </button>
                  <button
                    className="secundario"
                    onClick={() =>
                      accion(
                        () => api.agenda.cambiarEstadoSalida(s.id, 'realizada'),
                        'Salida realizada.',
                      )
                    }
                  >
                    Marcar realizada
                  </button>
                  <button
                    className="secundario"
                    onClick={() =>
                      window.confirm('¿Cancelar la salida? Se devuelven todos los cupos.') &&
                      accion(
                        () => api.agenda.cambiarEstadoSalida(s.id, 'cancelada'),
                        'Salida cancelada.',
                      )
                    }
                  >
                    Cancelar salida
                  </button>
                </div>
              )}
            </section>
          ))}
        </div>
      )}
      {tomando && (
        <ModalTomarCupo
          salida={tomando}
          onCerrar={() => setTomando(null)}
          onTomado={async () => {
            setTomando(null);
            setAviso('Cupo tomado.');
            await cargar();
          }}
        />
      )}
    </div>
  );
}

function ModalTomarCupo({
  salida,
  onCerrar,
  onTomado,
}: {
  salida: SalidaExperiencia;
  onCerrar: () => void;
  onTomado: () => void;
}) {
  const [personas, setPersonas] = useState(PERSONAS_INICIALES);
  const [quien, setQuien] = useState<QuienSinPersonas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const quienes = quienesDe(salida.servicio.modoPrecio, personas);

  async function confirmar(evento: FormEvent) {
    evento.preventDefault();
    if (!quien || !quienes) return;
    setGuardando(true);
    setError(null);
    try {
      await api.agenda.tomarCupo(salida.id, { ...quien, ...quienes });
      onTomado();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo tomar el cupo');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <form className="modal modal-ancho" onClick={(e) => e.stopPropagation()} onSubmit={confirmar}>
        <CabeceraModal
          icono={Mountain}
          titulo={`${salida.servicio.nombre} · ${formatearFechaHora(salida.inicio)}`}
        />
        <p className="texto-secundario">Quedan {salida.libres} cupos.</p>
        <CamposPersonas modo={salida.servicio.modoPrecio} valor={personas} onCambio={setPersonas} />
        <QuienTomaServicio onCambio={setQuien} />
        {error && <div className="mensaje-error">{error}</div>}
        <div className="acciones-modal">
          <button type="button" className="secundario" onClick={onCerrar}>
            Cancelar
          </button>
          <button className="primario" disabled={!quien || !quienes || guardando}>
            {guardando ? 'Guardando...' : 'Tomar cupo'}
          </button>
        </div>
      </form>
    </div>
  );
}
