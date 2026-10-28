import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CalendarClock, Mountain, Plus } from 'lucide-react';
import { api } from '../../api/client';
import type { RecursoServicio, Servicio } from '../../api/types';

// S-2: quién presta las citas (cabinas, terapeutas) y las salidas de las
// experiencias, con la repetición semanal. Recepción agenda desde la Agenda.
export function RecursosYSalidas() {
  const [recursos, setRecursos] = useState<RecursoServicio[]>([]);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [salida, setSalida] = useState({ servicioId: '', inicio: '', cupos: '', repetir: '0' });

  const cargar = useCallback(async () => {
    try {
      const [r, s] = await Promise.all([api.agenda.recursos(), api.servicios()]);
      setRecursos(r);
      setServicios(s.filter((x) => x.activo && x.tipo !== 'consumo'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar los recursos');
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const deCita = servicios.filter((s) => s.tipo === 'cita');
  const experiencias = servicios.filter((s) => s.tipo === 'experiencia');

  async function accion(hacer: () => Promise<unknown>, mensaje: string) {
    setError(null);
    setAviso(null);
    try {
      await hacer();
      setAviso(mensaje);
      await cargar();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
      return false;
    }
  }

  async function crearRecurso(evento: FormEvent) {
    evento.preventDefault();
    if (
      await accion(
        () => api.agenda.crearRecurso({ nombre: nombre.trim(), servicioIds: [] }),
        `Recurso "${nombre.trim()}" creado: marca los servicios que presta.`,
      )
    ) {
      setNombre('');
    }
  }

  const presta = (r: RecursoServicio, servicioId: string) =>
    r.servicios.some((s) => s.servicio.id === servicioId);

  function alternar(r: RecursoServicio, servicioId: string) {
    const ids = r.servicios.map((s) => s.servicio.id);
    const nuevos = presta(r, servicioId)
      ? ids.filter((id) => id !== servicioId)
      : [...ids, servicioId];
    accion(
      () => api.agenda.actualizarRecurso(r.id, { servicioIds: nuevos }),
      `${r.nombre} actualizado.`,
    );
  }

  async function crearSalida(evento: FormEvent) {
    evento.preventDefault();
    const repetir = Number(salida.repetir) || 0;
    if (
      await accion(
        () =>
          api.agenda.crearSalidas({
            servicioId: salida.servicioId,
            // La hora del formulario es la del hotel (Colombia, UTC-5).
            inicio: `${salida.inicio}:00-05:00`,
            cupos: salida.cupos ? Number(salida.cupos) : undefined,
            repetirSemanas: repetir,
          }),
        repetir > 0 ? `Se crearon ${repetir + 1} salidas (una por semana).` : 'Salida creada.',
      )
    ) {
      setSalida({ ...salida, inicio: '' });
    }
  }

  return (
    <>
      <section className="tarjeta">
        <h3 className="tarjeta-titulo">
          <CalendarClock size={18} /> Cabinas y terapeutas
        </h3>
        <p className="texto-secundario">
          Cada recurso atiende una cita a la vez: la agenda no deja cruzar dos citas del mismo
          recurso.
        </p>
        {error && <div className="mensaje-error">{error}</div>}
        {aviso && <div className="mensaje-exito">{aviso}</div>}
        {recursos.length > 0 && (
          <div className="contenedor-tabla">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Recurso</th>
                  <th>Servicios que presta</th>
                  <th>Activo</th>
                </tr>
              </thead>
              <tbody>
                {recursos.map((r) => (
                  <tr key={r.id}>
                    <td>{r.nombre}</td>
                    <td>
                      {deCita.length === 0 ? (
                        <span className="texto-secundario">No hay servicios de tipo cita.</span>
                      ) : (
                        deCita.map((s) => (
                          <label key={s.id} className="casilla">
                            <input
                              type="checkbox"
                              checked={presta(r, s.id)}
                              onChange={() => alternar(r, s.id)}
                            />
                            {s.nombre}
                          </label>
                        ))
                      )}
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`${r.nombre} activo`}
                        checked={r.activo}
                        onChange={(e) =>
                          accion(
                            () => api.agenda.actualizarRecurso(r.id, { activo: e.target.checked }),
                            `${r.nombre} ${e.target.checked ? 'activado' : 'desactivado'}.`,
                          )
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <form className="fila-campos" onSubmit={crearRecurso}>
          <div className="campo crece">
            <label htmlFor="recurso-nombre">Nuevo recurso</label>
            <input
              id="recurso-nombre"
              placeholder="p. ej. Cabina 1 o Terapeuta Ana"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </div>
          <button className="primario" disabled={!nombre.trim()}>
            <Plus size={16} /> Agregar
          </button>
        </form>
      </section>

      <section className="tarjeta">
        <h3 className="tarjeta-titulo">
          <Mountain size={18} /> Salidas de las experiencias
        </h3>
        {experiencias.length === 0 ? (
          <p className="vacio">No hay servicios de tipo experiencia en el catálogo.</p>
        ) : (
          <form className="fila-campos" onSubmit={crearSalida}>
            <div className="campo">
              <label htmlFor="salida-servicio">Experiencia</label>
              <select
                id="salida-servicio"
                value={salida.servicioId}
                onChange={(e) => setSalida({ ...salida, servicioId: e.target.value })}
              >
                <option value="">Elige…</option>
                {experiencias.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="campo">
              <label htmlFor="salida-inicio">Fecha y hora</label>
              <input
                id="salida-inicio"
                type="datetime-local"
                value={salida.inicio}
                onChange={(e) => setSalida({ ...salida, inicio: e.target.value })}
              />
            </div>
            <div className="campo">
              <label htmlFor="salida-cupos">Cupos</label>
              <input
                id="salida-cupos"
                type="number"
                min={1}
                placeholder={String(
                  experiencias.find((s) => s.id === salida.servicioId)?.cuposPorSalida ?? '',
                )}
                value={salida.cupos}
                onChange={(e) => setSalida({ ...salida, cupos: e.target.value })}
              />
            </div>
            <div className="campo">
              <label htmlFor="salida-repetir">Repetir (semanas)</label>
              <input
                id="salida-repetir"
                type="number"
                min={0}
                max={52}
                value={salida.repetir}
                onChange={(e) => setSalida({ ...salida, repetir: e.target.value })}
              />
            </div>
            <button className="primario" disabled={!salida.servicioId || !salida.inicio}>
              <Plus size={16} /> Crear
            </button>
          </form>
        )}
        <p className="texto-secundario">
          "Repetir" crea también la misma salida de las próximas semanas, todas a la vez. Los cupos
          se toman en la Agenda.
        </p>
      </section>
    </>
  );
}
