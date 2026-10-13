import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ChevronLeft, ChevronRight, Pencil, Plus, Sun } from 'lucide-react';
import { api, type DatosTipoHabitacion } from '../api/client';
import type { CalendarioTemporadas, Temporada, TipoHabitacion } from '../api/types';
import { formatearDinero, formatearFecha } from '../formato';

interface Props {
  // Solo el administrador cambia tarifas y crea tipos.
  puedeEditar: boolean;
}

const MS_DIA = 24 * 60 * 60 * 1000;
const ETIQUETA: Record<Temporada, string> = { baja: 'Baja', media: 'Media', alta: 'Alta' };

// Multiplicador en formato colombiano: ×1,15.
const factor = (valor: number) => `×${valor.toLocaleString('es-CO')}`;

const VACIO: DatosTipoHabitacion = {
  codigo: '',
  nombre: '',
  tarifaBase: 0,
  capacidadIncluida: 2,
  capacidadMaxima: 2,
  cargoPersonaAdicional: 0,
};

const aDatos = (t: TipoHabitacion): DatosTipoHabitacion => ({
  codigo: t.codigo,
  nombre: t.nombre,
  tarifaBase: Number(t.tarifaBase),
  capacidadIncluida: t.capacidadIncluida,
  capacidadMaxima: t.capacidadMaxima,
  cargoPersonaAdicional: Number(t.cargoPersonaAdicional),
});

// Precios por tipo y calendario de temporadas (R12–R16).
export function Tarifas({ puedeEditar }: Props) {
  const [tipos, setTipos] = useState<TipoHabitacion[]>([]);
  const [anio, setAnio] = useState(() => new Date().getFullYear());
  const [calendario, setCalendario] = useState<CalendarioTemporadas | null>(null);
  const [editando, setEditando] = useState<string | 'nuevo' | null>(null);
  const [borrador, setBorrador] = useState<DatosTipoHabitacion>(VACIO);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargarTipos = useCallback(async () => {
    try {
      setTipos(await api.tiposHabitacion());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar las tarifas');
    }
  }, []);

  useEffect(() => {
    cargarTipos();
  }, [cargarTipos]);

  useEffect(() => {
    api
      .temporadas(anio)
      .then(setCalendario)
      .catch((e) => setError(e instanceof Error ? e.message : 'Error al cargar las temporadas'));
  }, [anio]);

  function empezarEdicion(id: string | 'nuevo', datos: DatosTipoHabitacion) {
    setError(null);
    setAviso(null);
    setEditando(id);
    setBorrador(datos);
  }

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    try {
      if (editando === 'nuevo') {
        await api.crearTipoHabitacion(borrador);
        setAviso(`Tipo "${borrador.nombre}" creado.`);
      } else if (editando) {
        const { codigo: _codigo, ...cambios } = borrador; // el código no se edita
        await api.actualizarTipoHabitacion(editando, cambios);
        setAviso(`Tarifa de "${borrador.nombre}" actualizada. Aplica a las reservas nuevas.`);
      }
      setEditando(null);
      await cargarTipos();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    }
  }

  const multiplicador = calendario?.multiplicadores ?? { baja: 1, media: 1, alta: 1 };
  const campo = (nombre: keyof DatosTipoHabitacion, tipo: 'text' | 'number' = 'number') => (
    <input
      className="entrada-tabla"
      type={tipo}
      min={tipo === 'number' ? 0 : undefined}
      value={borrador[nombre]}
      onChange={(e) =>
        setBorrador({
          ...borrador,
          [nombre]: tipo === 'number' ? Number(e.target.value) : e.target.value,
        })
      }
      required
    />
  );

  return (
    <div>
      <div className="barra-titulo">
        <h2>Tarifas</h2>
        {puedeEditar && editando === null && (
          <button className="acento" onClick={() => empezarEdicion('nuevo', VACIO)}>
            <Plus size={16} /> Nuevo tipo de habitación
          </button>
        )}
      </div>
      {error && <div className="mensaje-error">{error}</div>}
      {aviso && <div className="mensaje-exito">{aviso}</div>}

      <form onSubmit={guardar} className="contenedor-tabla">
        <table className="tabla">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Baja</th>
              <th>Media</th>
              <th>Alta</th>
              <th>Incluye</th>
              <th>Máximo</th>
              <th>Persona adicional</th>
              <th>Habitaciones</th>
              {puedeEditar && <th />}
            </tr>
          </thead>
          <tbody>
            {tipos.map((t) =>
              editando === t.id ? (
                <FilaEdicion key={t.id} campo={campo} onCancelar={() => setEditando(null)} />
              ) : (
                <tr key={t.id}>
                  <td>
                    <strong>{t.nombre}</strong>
                    <div className="texto-secundario">{t.codigo}</div>
                  </td>
                  {(['baja', 'media', 'alta'] as const).map((temporada) => (
                    <td key={temporada}>
                      {formatearDinero(Math.round(Number(t.tarifaBase) * multiplicador[temporada]))}
                    </td>
                  ))}
                  <td>{t.capacidadIncluida}</td>
                  <td>{t.capacidadMaxima}</td>
                  <td>{formatearDinero(t.cargoPersonaAdicional)} / noche</td>
                  <td>{t._count?.habitaciones ?? 0}</td>
                  {puedeEditar && (
                    <td>
                      <button
                        type="button"
                        className="enlace"
                        disabled={editando !== null}
                        onClick={() => empezarEdicion(t.id, aDatos(t))}
                      >
                        <Pencil size={14} /> Editar
                      </button>
                    </td>
                  )}
                </tr>
              ),
            )}
            {editando === 'nuevo' && (
              <FilaEdicion campo={campo} nuevo onCancelar={() => setEditando(null)} />
            )}
          </tbody>
        </table>
      </form>
      <p className="texto-secundario">
        La columna "Baja" es la tarifa base; media y alta la multiplican por{' '}
        {factor(multiplicador.media)} y {factor(multiplicador.alta)}. Los cambios aplican a las
        reservas nuevas: las existentes conservan su precio pactado.
      </p>

      {calendario && (
        <section className="tarjeta seccion-temporadas">
          <div className="barra-titulo">
            <h3 className="tarjeta-titulo">
              <Sun size={18} /> Temporadas {calendario.anio}
            </h3>
            <div className="acciones-tabla">
              <button className="secundario" onClick={() => setAnio(anio - 1)}>
                <ChevronLeft size={14} /> {anio - 1}
              </button>
              <button className="secundario" onClick={() => setAnio(anio + 1)}>
                {anio + 1} <ChevronRight size={14} />
              </button>
            </div>
          </div>
          <p className="texto-secundario">
            Alta: fin de año, Semana Santa y vacaciones de mitad de año. Media: puentes festivos
            (calculados con la Ley Emiliani). El resto del año es temporada baja. IVA:{' '}
            {calendario.ivaPorcentaje} % (exento para huéspedes extranjeros con pasaporte).
          </p>
          <div className="contenedor-tabla">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Noches</th>
                  <th>Temporada</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {calendario.periodos.map((p) => {
                  const noches =
                    Math.round((Date.parse(p.hasta) - Date.parse(p.desde)) / MS_DIA) + 1;
                  return (
                    <tr key={p.desde}>
                      <td>
                        {formatearFecha(p.desde)}
                        {noches > 1 && ` → ${formatearFecha(p.hasta)}`}
                        <span className="texto-secundario">
                          {' '}
                          ({noches} {noches === 1 ? 'noche' : 'noches'})
                        </span>
                      </td>
                      <td>
                        <span className={`etiqueta-temporada ${p.temporada}`}>
                          {ETIQUETA[p.temporada]} {factor(multiplicador[p.temporada])}
                        </span>
                      </td>
                      <td>{p.motivo}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

interface PropsFila {
  campo: (nombre: keyof DatosTipoHabitacion, tipo?: 'text' | 'number') => React.ReactNode;
  nuevo?: boolean;
  onCancelar: () => void;
}

function FilaEdicion({ campo, nuevo = false, onCancelar }: PropsFila) {
  return (
    <tr className="fila-edicion">
      <td>
        {campo('nombre', 'text')}
        {nuevo && campo('codigo', 'text')}
      </td>
      <td colSpan={3}>{campo('tarifaBase')}</td>
      <td>{campo('capacidadIncluida')}</td>
      <td>{campo('capacidadMaxima')}</td>
      <td>{campo('cargoPersonaAdicional')}</td>
      <td colSpan={2}>
        <div className="acciones-tabla">
          <button type="submit" className="primario">
            Guardar
          </button>
          <button type="button" className="secundario" onClick={onCancelar}>
            Cancelar
          </button>
        </div>
      </td>
    </tr>
  );
}
