import { useEffect, useState, type FormEvent } from 'react';
import { Layers } from 'lucide-react';
import { api } from '../api/client';
import type { TipoHabitacion } from '../api/types';
import { numerosDelRango } from '../logica/habitaciones';
import { CabeceraModal } from './CabeceraModal';

interface Props {
  onCerrar: () => void;
  onCreadas: (creadas: number) => void;
}

// A-4: crea "101" a "120" de una vez. Si alguno ya existe, no se crea ninguno.
export function ModalRangoHabitaciones({ onCerrar, onCreadas }: Props) {
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [prefijo, setPrefijo] = useState('');
  const [piso, setPiso] = useState('');
  const [tipos, setTipos] = useState<TipoHabitacion[]>([]);
  const [tipoId, setTipoId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api
      .tiposHabitacion()
      .then((lista) => {
        setTipos(lista);
        setTipoId((actual) => actual || lista[0]?.id || '');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Error al cargar los tipos'));
  }, []);

  const numeros = numerosDelRango(desde, hasta, prefijo);
  const demasiadas = numeros.length > 500;

  async function manejarSubmit(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const { creadas } = await api.crearRangoHabitaciones({
        desde,
        hasta,
        tipoId,
        prefijo: prefijo || undefined,
        piso: piso === '' ? undefined : Number(piso),
      });
      onCreadas(creadas);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear el rango');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <CabeceraModal icono={Layers} titulo="Crear un rango de habitaciones" />
        {error && <div className="mensaje-error">{error}</div>}
        <form onSubmit={manejarSubmit}>
          <div className="fila-campos">
            <div className="campo">
              <label htmlFor="rango-desde">Desde</label>
              <input
                id="rango-desde"
                inputMode="numeric"
                value={desde}
                onChange={(e) => setDesde(e.target.value.trim())}
                placeholder="101"
                required
              />
            </div>
            <div className="campo">
              <label htmlFor="rango-hasta">Hasta</label>
              <input
                id="rango-hasta"
                inputMode="numeric"
                value={hasta}
                onChange={(e) => setHasta(e.target.value.trim())}
                placeholder="120"
                required
              />
            </div>
          </div>
          <div className="fila-campos">
            <div className="campo">
              <label htmlFor="rango-prefijo">Prefijo (opcional)</label>
              <input
                id="rango-prefijo"
                value={prefijo}
                maxLength={10}
                onChange={(e) => setPrefijo(e.target.value)}
                placeholder="C-"
              />
            </div>
            <div className="campo">
              <label htmlFor="rango-piso">Piso (opcional)</label>
              <input
                id="rango-piso"
                type="number"
                min={0}
                value={piso}
                onChange={(e) => setPiso(e.target.value)}
                placeholder="Según el número"
              />
            </div>
          </div>
          <div className="campo">
            <label htmlFor="rango-tipo">Tipo</label>
            <select
              id="rango-tipo"
              value={tipoId}
              onChange={(e) => setTipoId(e.target.value)}
              required
            >
              {tipos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </div>
          <p className="texto-secundario">
            {numeros.length === 0
              ? 'Escribe el primer y el último número del rango.'
              : demasiadas
                ? 'Un rango admite hasta 500 habitaciones.'
                : `Se crearán ${numeros.length}: ${numeros[0]}${numeros.length > 1 ? ` … ${numeros[numeros.length - 1]}` : ''}.`}
          </p>
          <div className="acciones-modal">
            <button type="button" className="secundario" onClick={onCerrar}>
              Cancelar
            </button>
            <button
              type="submit"
              className="primario"
              disabled={enviando || !tipoId || numeros.length === 0 || demasiadas}
            >
              {enviando ? 'Creando...' : `Crear ${numeros.length || ''}`.trim()}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
