import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Plus, RefreshCw, Sparkles, UserCheck, Wrench } from 'lucide-react';
import { api } from '../api/client';
import type {
  Habitacion,
  Incidencia,
  RolUsuario,
  TareasDelDia,
  TipoTareaLimpieza,
} from '../api/types';
import { ModalIncidencia } from '../components/ModalIncidencia';
import { ETIQUETA_ROL, formatearFechaHora } from '../formato';
import {
  ETIQUETA_ESTADO_TAREA,
  ETIQUETA_PRIORIDAD,
  ETIQUETA_TIPO_TAREA,
  avancePorPersona,
} from '../logica/limpieza';

const TONO_TAREA = { pendiente: 'confirmada', en_proceso: 'activa', terminada: 'libre' } as const;

// B-4: "Limpieza de hoy" para recepción y el admin: asignar las tareas con
// selección múltiple, crear una a mano, ver el avance y las incidencias.
export function Limpieza({ puedeResolver }: { puedeResolver: boolean }) {
  const [dia, setDia] = useState<TareasDelDia | null>(null);
  const [personal, setPersonal] = useState<{ id: string; nombre: string; rol: RolUsuario }[]>([]);
  const [habitaciones, setHabitaciones] = useState<Habitacion[]>([]);
  const [incidencias, setIncidencias] = useState<Incidencia[]>([]);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [asignarA, setAsignarA] = useState('');
  const [nueva, setNueva] = useState<{ habitacionId: string; tipo: TipoTareaLimpieza }>({
    habitacionId: '',
    tipo: 'profunda',
  });
  const [reportandoEn, setReportandoEn] = useState('');
  const [reportando, setReportando] = useState<Habitacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [d, i] = await Promise.all([api.limpieza.tareas(), api.incidencias.listar('abierta')]);
      setDia(d);
      setIncidencias(i);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la limpieza');
    }
  }, []);

  useEffect(() => {
    cargar();
    api.limpieza
      .personal()
      .then(setPersonal)
      .catch(() => setPersonal([]));
    api
      .listarHabitaciones()
      .then(setHabitaciones)
      .catch(() => setHabitaciones([]));
  }, [cargar]);

  async function ejecutar(accion: () => Promise<unknown>, exito: string) {
    setError(null);
    setAviso(null);
    try {
      await accion();
      setAviso(exito);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar');
    }
  }

  function alternar(id: string) {
    const siguiente = new Set(seleccion);
    if (siguiente.has(id)) siguiente.delete(id);
    else siguiente.add(id);
    setSeleccion(siguiente);
  }

  const abiertas = dia?.tareas.filter((t) => t.estado !== 'terminada') ?? [];
  const todasMarcadas = abiertas.length > 0 && abiertas.every((t) => seleccion.has(t.id));
  const nombreDe = (id: string) => personal.find((p) => p.id === id)?.nombre ?? 'sin asignar';

  return (
    <div className="pila-gerencia">
      <section className="tarjeta">
        <h3 className="tarjeta-titulo">
          <Sparkles size={18} /> Limpieza de hoy
          <button className="enlace" onClick={cargar}>
            <RefreshCw size={14} /> Actualizar
          </button>
        </h3>
        {error && <div className="mensaje-error">{error}</div>}
        {aviso && <div className="mensaje-exito">{aviso}</div>}
        {dia && (
          <>
            <div className="avance-limpieza">
              <div className="barra-avance" aria-label={`Avance ${dia.avance.porcentaje}%`}>
                <span style={{ width: `${dia.avance.porcentaje}%` }} />
              </div>
              <strong>{dia.avance.porcentaje}%</strong>
              <span className="texto-secundario">
                {dia.avance.terminadas} de {dia.avance.total} tareas
              </span>
            </div>
            {dia.tareas.length > 0 && (
              <ul className="avance-personas">
                {avancePorPersona(dia.tareas).map((p) => (
                  <li key={p.nombre}>
                    {p.nombre}: {p.terminadas}/{p.total} ({p.porcentaje}%)
                  </li>
                ))}
              </ul>
            )}

            {dia.tareas.length === 0 ? (
              <p className="vacio">No hay tareas de limpieza hoy.</p>
            ) : (
              <div className="contenedor-tabla">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>
                        <input
                          type="checkbox"
                          aria-label="Seleccionar todas las pendientes"
                          checked={todasMarcadas}
                          onChange={() =>
                            setSeleccion(
                              todasMarcadas ? new Set() : new Set(abiertas.map((t) => t.id)),
                            )
                          }
                        />
                      </th>
                      <th>Habitación</th>
                      <th>Tarea</th>
                      <th>Estado</th>
                      <th>Asignada a</th>
                      <th>Terminada</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dia.tareas.map((t) => (
                      <tr key={t.id}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Seleccionar la ${t.habitacion.numero}`}
                            disabled={t.estado === 'terminada'}
                            checked={seleccion.has(t.id)}
                            onChange={() => alternar(t.id)}
                          />
                        </td>
                        <td>{t.habitacion.numero}</td>
                        <td>{ETIQUETA_TIPO_TAREA[t.tipo]}</td>
                        <td>
                          <span className={`badge-estado ${TONO_TAREA[t.estado]}`}>
                            {ETIQUETA_ESTADO_TAREA[t.estado]}
                          </span>
                        </td>
                        <td>{t.asignadaA?.nombre ?? '—'}</td>
                        <td>
                          {t.fin ? formatearFechaHora(t.fin) : '—'}
                          {t.observaciones && (
                            <div className="texto-secundario">{t.observaciones}</div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="fila-campos">
              <div className="campo">
                <label htmlFor="limpieza-asignar">Asignar las seleccionadas a</label>
                <select
                  id="limpieza-asignar"
                  value={asignarA}
                  onChange={(e) => setAsignarA(e.target.value)}
                >
                  <option value="">Nadie (quitar la asignación)</option>
                  {personal.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} ({ETIQUETA_ROL[p.rol]})
                    </option>
                  ))}
                </select>
              </div>
              <button
                className="primario"
                disabled={seleccion.size === 0}
                onClick={() =>
                  ejecutar(
                    async () => {
                      await api.limpieza.asignar([...seleccion], asignarA || null);
                      setSeleccion(new Set());
                    },
                    `${seleccion.size} tarea(s) asignadas a ${nombreDe(asignarA)}`,
                  )
                }
              >
                <UserCheck size={15} /> Asignar ({seleccion.size})
              </button>
            </div>
          </>
        )}

        <h4>Crear una tarea a mano</h4>
        <div className="fila-campos">
          <div className="campo">
            <label htmlFor="limpieza-habitacion">Habitación</label>
            <select
              id="limpieza-habitacion"
              value={nueva.habitacionId}
              onChange={(e) => setNueva({ ...nueva, habitacionId: e.target.value })}
            >
              <option value="">Elige una</option>
              {habitaciones.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.numero}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="limpieza-tipo">Tipo</label>
            <select
              id="limpieza-tipo"
              value={nueva.tipo}
              onChange={(e) => setNueva({ ...nueva, tipo: e.target.value as TipoTareaLimpieza })}
            >
              <option value="profunda">{ETIQUETA_TIPO_TAREA.profunda}</option>
              <option value="repaso">{ETIQUETA_TIPO_TAREA.repaso}</option>
            </select>
          </div>
          <button
            className="secundario"
            disabled={!nueva.habitacionId}
            onClick={() => ejecutar(() => api.limpieza.crear(nueva), 'Tarea creada para hoy')}
          >
            <Plus size={15} /> Crear
          </button>
        </div>
      </section>

      <section className="tarjeta">
        <h3 className="tarjeta-titulo">
          <Wrench size={18} /> Incidencias abiertas
        </h3>
        <div className="fila-campos">
          <div className="campo">
            <label htmlFor="incidencia-habitacion">Reportar un daño en</label>
            <select
              id="incidencia-habitacion"
              value={reportandoEn}
              onChange={(e) => setReportandoEn(e.target.value)}
            >
              <option value="">Elige una habitación</option>
              {habitaciones.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.numero}
                </option>
              ))}
            </select>
          </div>
          <button
            className="secundario"
            disabled={!reportandoEn}
            onClick={() => setReportando(habitaciones.find((h) => h.id === reportandoEn) ?? null)}
          >
            <Wrench size={15} /> Reportar
          </button>
        </div>
        {incidencias.length === 0 ? (
          <p className="vacio">No hay incidencias abiertas.</p>
        ) : (
          <ul className="lista-intentos">
            {incidencias.map((i) => (
              <li key={i.id}>
                <div>
                  <strong>{i.habitacion.numero}</strong> · {i.descripcion}{' '}
                  <span className={`badge-estado prioridad-${i.prioridad}`}>
                    {ETIQUETA_PRIORIDAD[i.prioridad]}
                  </span>
                  {i.habitacion.estado === 'fuera_servicio' && (
                    <span className="badge-estado fuera_servicio">Fuera de servicio</span>
                  )}
                </div>
                <div className="texto-secundario">
                  {i.reportadaPor.nombre} · {formatearFechaHora(i.creadaEn)}
                </div>
                {puedeResolver && (
                  <div className="acciones-tarjeta">
                    <button
                      className="enlace"
                      onClick={() => {
                        const solucion =
                          window.prompt('¿Cómo se resolvió? (opcional)') ?? undefined;
                        ejecutar(
                          () => api.incidencias.resolver(i.id, solucion || undefined),
                          i.habitacion.estado === 'fuera_servicio'
                            ? `Resuelta. La ${i.habitacion.numero} sigue fuera de servicio: vuélvela a servicio desde Habitaciones cuando esté lista`
                            : 'Incidencia resuelta',
                        );
                      }}
                    >
                      <CheckCircle2 size={14} /> Resolver
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {reportando && (
        <ModalIncidencia
          habitacion={reportando}
          onCerrar={() => setReportando(null)}
          onReportada={(i) => {
            setReportando(null);
            setReportandoEn('');
            setAviso(
              i.sacaDeServicio
                ? `La ${i.habitacion.numero} quedó fuera de servicio${
                    i.reservasAfectadas
                      ? `: hay ${i.reservasAfectadas} reserva(s) futuras por reubicar`
                      : ''
                  }`
                : 'Incidencia reportada',
            );
            cargar();
          }}
        />
      )}
    </div>
  );
}
