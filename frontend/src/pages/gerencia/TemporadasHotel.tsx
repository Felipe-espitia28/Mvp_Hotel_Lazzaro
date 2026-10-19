import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CalendarHeart, CalendarRange, Plus, Sparkles, Trash2 } from 'lucide-react';
import { api } from '../../api/client';
import type { CalendarioTemporadas, TemporadaHotel } from '../../api/types';
import { useHotel } from '../../contexto/HotelActual';
import { formatearFecha } from '../../formato';
import { MESES, aMesDia, diaDe, diasDelMes, formatearRango, mesDe } from '../../logica/mesDia';

const ETIQUETA = { alta: 'Alta', media: 'Media', baja: 'Baja' } as const;

// Selector de mes y día para una fecha que se repite cada año.
function SelectorMesDia({
  id,
  valor,
  onCambio,
}: {
  id: string;
  valor: number;
  onCambio: (mesDia: number) => void;
}) {
  const mes = mesDe(valor);
  const dia = diaDe(valor);
  return (
    <div className="selector-mes-dia">
      <select
        id={id}
        aria-label="Día"
        value={dia}
        onChange={(e) => onCambio(aMesDia(mes, Number(e.target.value)))}
      >
        {Array.from({ length: diasDelMes(mes) }, (_, i) => i + 1).map((d) => (
          <option key={d}>{d}</option>
        ))}
      </select>
      <select
        aria-label="Mes"
        value={mes}
        onChange={(e) => {
          const nuevoMes = Number(e.target.value);
          onCambio(aMesDia(nuevoMes, Math.min(dia, diasDelMes(nuevoMes))));
        }}
      >
        {MESES.map((m, i) => (
          <option key={m} value={i + 1}>
            {m}
          </option>
        ))}
      </select>
    </div>
  );
}

// Temporadas del hotel: sus rangos de temporada alta y media (se repiten cada
// año) y si aplican las que se calculan para Colombia.
export function TemporadasHotel() {
  const { hotel, recargar } = useHotel();
  const [temporadas, setTemporadas] = useState<TemporadaHotel[]>([]);
  const [calendario, setCalendario] = useState<CalendarioTemporadas | null>(null);
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<'alta' | 'media'>('alta');
  const [desde, setDesde] = useState(1215);
  const [hasta, setHasta] = useState(115);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [lista, delAnio] = await Promise.all([api.temporadasHotel(), api.temporadas()]);
      setTemporadas(lista);
      setCalendario(delAnio);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar las temporadas');
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function ejecutar(accion: () => Promise<unknown>, mensaje: string) {
    setError(null);
    setAviso(null);
    try {
      await accion();
      // Las reglas del hotel cambiaron: se recargan las de toda la app y el calendario.
      await recargar();
      await cargar();
      setAviso(mensaje);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    }
  }

  function crear(evento: FormEvent) {
    evento.preventDefault();
    ejecutar(async () => {
      await api.crearTemporada({ nombre, tipo, desde, hasta });
      setNombre('');
    }, `Temporada "${nombre}" creada. Aplica a las reservas nuevas.`);
  }

  const politicas = hotel?.politicas;
  const multiplicador = (t: 'alta' | 'media') =>
    politicas ? `×${politicas.multiplicadorTemporada[t].toLocaleString('es-CO')}` : '';

  return (
    <div>
      {error && <div className="mensaje-error">{error}</div>}
      {aviso && <div className="mensaje-exito">{aviso}</div>}

      <div className="grid-politicas">
        <section className="tarjeta">
          <h3 className="tarjeta-titulo">
            <CalendarRange size={18} /> Temporadas del hotel
          </h3>
          {temporadas.length === 0 ? (
            <p className="vacio">Sin temporadas propias: todo el año es temporada baja.</p>
          ) : (
            <ul className="lista-temporadas">
              {temporadas.map((t) => (
                <li key={t.id} className={t.activa ? '' : 'inactiva'}>
                  <span className={`etiqueta-temporada ${t.tipo}`}>
                    {ETIQUETA[t.tipo]} {multiplicador(t.tipo)}
                  </span>
                  <span className="lista-temporadas-datos">
                    <strong>{t.nombre}</strong>
                    <span className="texto-secundario">{formatearRango(t.desde, t.hasta)}</span>
                  </span>
                  <label className="casilla">
                    <input
                      type="checkbox"
                      checked={t.activa}
                      onChange={(e) =>
                        ejecutar(
                          () => api.actualizarTemporada(t.id, { activa: e.target.checked }),
                          e.target.checked ? `"${t.nombre}" activada.` : `"${t.nombre}" pausada.`,
                        )
                      }
                    />
                    Activa
                  </label>
                  <button
                    type="button"
                    className="enlace"
                    aria-label={`Eliminar ${t.nombre}`}
                    onClick={() =>
                      window.confirm(`¿Eliminar la temporada "${t.nombre}"?`) &&
                      ejecutar(() => api.eliminarTemporada(t.id), `"${t.nombre}" eliminada.`)
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={crear} className="form-temporada">
            <h4>
              <Plus size={15} /> Nueva temporada
            </h4>
            <div className="fila-campos">
              <div className="campo crece">
                <label htmlFor="temp-nombre">Nombre</label>
                <input
                  id="temp-nombre"
                  placeholder="p. ej. Festival de Jazz"
                  value={nombre}
                  required
                  maxLength={60}
                  onChange={(e) => setNombre(e.target.value)}
                />
              </div>
              <div className="campo">
                <label htmlFor="temp-tipo">Temporada</label>
                <select
                  id="temp-tipo"
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as 'alta' | 'media')}
                >
                  <option value="alta">Alta {multiplicador('alta')}</option>
                  <option value="media">Media {multiplicador('media')}</option>
                </select>
              </div>
            </div>
            <div className="fila-campos">
              <div className="campo">
                <label htmlFor="temp-desde">Desde la noche del</label>
                <SelectorMesDia id="temp-desde" valor={desde} onCambio={setDesde} />
              </div>
              <div className="campo">
                <label htmlFor="temp-hasta">Hasta la noche del</label>
                <SelectorMesDia id="temp-hasta" valor={hasta} onCambio={setHasta} />
              </div>
            </div>
            <p className="texto-secundario">
              Se repite cada año
              {desde > hasta ? ' y cruza el fin de año' : ''}. Si dos temporadas se cruzan, gana la
              alta.
            </p>
            <button className="acento">
              <Plus size={16} /> Agregar temporada
            </button>
          </form>
        </section>

        <div>
          <section className="tarjeta">
            <h3 className="tarjeta-titulo">
              <Sparkles size={18} /> Calculadas para Colombia
            </h3>
            <label className="casilla">
              <input
                type="checkbox"
                checked={politicas?.semanaSantaAlta ?? true}
                onChange={(e) =>
                  ejecutar(
                    () => api.actualizarPoliticas({ semanaSantaAlta: e.target.checked }),
                    'Semana Santa actualizada.',
                  )
                }
              />
              Semana Santa es temporada alta
            </label>
            <label className="casilla">
              <input
                type="checkbox"
                checked={politicas?.puentesFestivosMedia ?? true}
                onChange={(e) =>
                  ejecutar(
                    () => api.actualizarPoliticas({ puentesFestivosMedia: e.target.checked }),
                    'Puentes festivos actualizados.',
                  )
                }
              />
              Los puentes festivos son temporada media
            </label>
            <p className="texto-secundario">
              Las fechas se calculan solas cada año (Pascua y Ley Emiliani).
            </p>
          </section>

          {calendario && (
            <section className="tarjeta">
              <h3 className="tarjeta-titulo">
                <CalendarHeart size={18} /> Así queda {calendario.anio}
              </h3>
              <ul className="periodos-anio">
                {calendario.periodos.map((p) => (
                  <li key={p.desde}>
                    <span className={`etiqueta-temporada ${p.temporada}`}>
                      {ETIQUETA[p.temporada]}
                    </span>
                    <span>
                      {formatearFecha(p.desde)}
                      {p.desde !== p.hasta && ` → ${formatearFecha(p.hasta)}`}
                    </span>
                    <span className="texto-secundario">{p.motivo}</span>
                  </li>
                ))}
              </ul>
              <p className="texto-secundario">El resto del año es temporada baja.</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
