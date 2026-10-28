import { useEffect, useState } from 'react';
import { CheckSquare, FileUp, Layers, Plus, X } from 'lucide-react';
import { api } from '../api/client';
import type { AvisosLote, Habitacion, TipoHabitacion } from '../api/types';
import { ETIQUETA_ESTADO_HABITACION } from '../formato';
import { TarjetaHabitacion } from '../components/TarjetaHabitacion';
import { ModalNuevaHabitacion } from '../components/ModalNuevaHabitacion';
import { ModalRangoHabitaciones } from '../components/ModalRangoHabitaciones';
import { ImportadorArchivo } from '../components/ImportadorArchivo';
import { pisosPresentes } from '../logica/habitaciones';

interface Props {
  // Solo quien puede gestionar habitaciones (administrador) ve el botón de crear.
  puedeCrear: boolean;
  // Recepción y admin marcan habitaciones listas o fuera de servicio (R25, R26).
  puedeCambiarEstado: boolean;
}

// A-4: columnas del archivo de importación (el backend acepta también variantes con tildes).
const COLUMNAS_IMPORTACION = [
  { nombre: 'numero', descripcion: 'obligatorio; si ya existe, se actualiza' },
  { nombre: 'tipo', descripcion: 'código del tipo, como en Tarifas' },
  { nombre: 'piso', descripcion: 'opcional; si falta, sale del número' },
  { nombre: 'descripcion', descripcion: 'opcional' },
];

// " Atención: 2 reservas futuras (503: 2)..." para los avisos agrupados de un lote.
function textoAvisos(avisos: AvisosLote, que: string) {
  if (avisos.total === 0) return '';
  const detalle = avisos.reservasFuturas.map((r) => `${r.numero}: ${r.reservas}`).join(', ');
  return ` Atención: ${avisos.total} reserva(s) futura(s) ${que} (${detalle}).`;
}

export function TableroHabitaciones({ puedeCrear, puedeCambiarEstado }: Props) {
  const [habitaciones, setHabitaciones] = useState<Habitacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [modal, setModal] = useState<'nueva' | 'rango' | 'importar' | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // A-4: modo "Seleccionar" para cambiar muchas a la vez.
  const [seleccionando, setSeleccionando] = useState(false);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [tipos, setTipos] = useState<TipoHabitacion[]>([]);

  async function cargar() {
    setCargando(true);
    try {
      setHabitaciones(await api.listarHabitaciones());
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  useEffect(() => {
    if (seleccionando && puedeCrear && tipos.length === 0) {
      api
        .tiposHabitacion()
        .then(setTipos)
        .catch(() => setTipos([]));
    }
  }, [seleccionando, puedeCrear, tipos.length]);

  async function cambiarEstado(h: Habitacion, estado: 'libre' | 'fuera_servicio') {
    if (
      estado === 'fuera_servicio' &&
      !window.confirm(`¿Sacar de servicio la habitación ${h.numero}? No se ofrecerá para reservas.`)
    ) {
      return;
    }
    setError(null);
    setAviso(null);
    setProcesando(h.id);
    try {
      const resultado = await api.cambiarEstadoHabitacion(h.id, estado);
      setAviso(
        estado === 'libre'
          ? `Habitación ${h.numero} lista para el siguiente huésped.`
          : `Habitación ${h.numero} fuera de servicio.` +
              (resultado.reservasAfectadas > 0
                ? ` Atención: tiene ${resultado.reservasAfectadas} reserva(s) futura(s) por reubicar.`
                : ''),
      );
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar el estado');
    } finally {
      setProcesando(null);
    }
  }

  function alternar(id: string) {
    setSeleccion((actual) => {
      const nueva = new Set(actual);
      if (nueva.has(id)) nueva.delete(id);
      else nueva.add(id);
      return nueva;
    });
  }

  function salirDeSeleccion() {
    setSeleccionando(false);
    setSeleccion(new Set());
  }

  // Cambio en lote: todo o nada (R52); los avisos vienen agrupados.
  async function enLote(
    accion: () => Promise<{ actualizadas: number; avisos: AvisosLote }>,
    mensaje: (n: number, avisos: AvisosLote) => string,
  ) {
    setError(null);
    setAviso(null);
    setProcesando('lote');
    try {
      const { actualizadas, avisos } = await accion();
      setAviso(mensaje(actualizadas, avisos));
      salirDeSeleccion();
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo aplicar el cambio');
    } finally {
      setProcesando(null);
    }
  }

  function estadoEnLote(estado: 'libre' | 'fuera_servicio') {
    const ids = [...seleccion];
    if (
      estado === 'fuera_servicio' &&
      !window.confirm(
        `¿Sacar de servicio ${ids.length} habitación(es)? No se ofrecerán para reservas.`,
      )
    ) {
      return;
    }
    enLote(
      () => api.cambiarEstadoEnLote(ids, estado),
      (n, avisos) =>
        estado === 'libre'
          ? `${n} habitación(es) listas.`
          : `${n} habitación(es) fuera de servicio.` + textoAvisos(avisos, 'por reubicar'),
    );
  }

  function tipoEnLote(tipoId: string) {
    const tipo = tipos.find((t) => t.id === tipoId);
    if (
      !tipo ||
      !window.confirm(`¿Cambiar ${seleccion.size} habitación(es) al tipo ${tipo.nombre}?`)
    ) {
      return;
    }
    const ids = [...seleccion];
    enLote(
      () => api.cambiarTipoEnLote(ids, tipoId),
      (n, avisos) =>
        `${n} habitación(es) ahora son ${tipo.nombre}.` +
        textoAvisos(avisos, 'conservan el precio pactado'),
    );
  }

  const conteo = (estado: Habitacion['estado']) =>
    habitaciones.filter((h) => h.estado === estado).length;
  const pisos = pisosPresentes(habitaciones);
  const enLoteActivo = procesando === 'lote';

  return (
    <div>
      <div className="barra-titulo">
        <div>
          <h2>Habitaciones</h2>
          {habitaciones.length > 0 && (
            <div className="resumen-estados">
              {(['libre', 'ocupada', 'en_limpieza', 'fuera_servicio'] as const).map((e) => (
                <span key={e} className={`badge-estado ${e}`}>
                  {ETIQUETA_ESTADO_HABITACION[e]} · {conteo(e)}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="acciones-barra">
          {puedeCambiarEstado && habitaciones.length > 0 && !seleccionando && (
            <button className="secundario" onClick={() => setSeleccionando(true)}>
              <CheckSquare size={16} /> Seleccionar
            </button>
          )}
          {puedeCrear && (
            <>
              <button className="secundario" onClick={() => setModal('importar')}>
                <FileUp size={16} /> Importar
              </button>
              <button className="secundario" onClick={() => setModal('rango')}>
                <Layers size={16} /> Crear rango
              </button>
              <button className="acento" onClick={() => setModal('nueva')}>
                <Plus size={16} /> Nueva habitación
              </button>
            </>
          )}
        </div>
      </div>
      {error && <div className="mensaje-error">{error}</div>}
      {aviso && <div className="mensaje-exito">{aviso}</div>}

      {seleccionando && (
        <div className="barra-lote">
          <strong>{seleccion.size} seleccionada(s)</strong>
          <button
            className="enlace"
            onClick={() => setSeleccion(new Set(habitaciones.map((h) => h.id)))}
          >
            Todas
          </button>
          {pisos.length > 0 && (
            <select
              aria-label="Seleccionar las del piso"
              value=""
              onChange={(e) => {
                const piso = Number(e.target.value);
                setSeleccion(
                  (actual) =>
                    new Set([
                      ...actual,
                      ...habitaciones.filter((h) => h.piso === piso).map((h) => h.id),
                    ]),
                );
              }}
            >
              <option value="">Las del piso…</option>
              {pisos.map((p) => (
                <option key={p} value={p}>
                  Piso {p}
                </option>
              ))}
            </select>
          )}
          <button
            className="secundario"
            disabled={seleccion.size === 0 || enLoteActivo}
            onClick={() => estadoEnLote('libre')}
          >
            Marcar listas
          </button>
          <button
            className="secundario"
            disabled={seleccion.size === 0 || enLoteActivo}
            onClick={() => estadoEnLote('fuera_servicio')}
          >
            Fuera de servicio
          </button>
          {puedeCrear && tipos.length > 0 && (
            <select
              aria-label="Cambiar el tipo de las seleccionadas"
              value=""
              disabled={seleccion.size === 0 || enLoteActivo}
              onChange={(e) => tipoEnLote(e.target.value)}
            >
              <option value="">Cambiar tipo a…</option>
              {tipos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          )}
          <button className="enlace" onClick={salirDeSeleccion}>
            <X size={14} /> Terminar
          </button>
        </div>
      )}

      {cargando ? (
        <p>Cargando...</p>
      ) : habitaciones.length === 0 ? (
        <p className="vacio">
          Aún no hay habitaciones registradas.
          {puedeCrear && ' Créalas por rango o impórtalas desde un archivo.'}
        </p>
      ) : (
        <div className="grid-habitaciones">
          {habitaciones.map((h) => (
            <TarjetaHabitacion
              key={h.id}
              habitacion={h}
              procesando={procesando === h.id}
              onCambiarEstado={
                puedeCambiarEstado ? (estado) => cambiarEstado(h, estado) : undefined
              }
              seleccion={
                seleccionando
                  ? { marcada: seleccion.has(h.id), onCambiar: () => alternar(h.id) }
                  : undefined
              }
            />
          ))}
        </div>
      )}

      {modal === 'nueva' && (
        <ModalNuevaHabitacion
          onCerrar={() => setModal(null)}
          onCreada={() => {
            setModal(null);
            cargar();
          }}
        />
      )}
      {modal === 'rango' && (
        <ModalRangoHabitaciones
          onCerrar={() => setModal(null)}
          onCreadas={(creadas) => {
            setModal(null);
            setAviso(`${creadas} habitaciones creadas.`);
            cargar();
          }}
        />
      )}
      {modal === 'importar' && (
        <ImportadorArchivo
          titulo="Importar habitaciones"
          columnas={COLUMNAS_IMPORTACION}
          validar={api.validarImportacionHabitaciones}
          aplicar={api.importarHabitaciones}
          onPlantilla={() =>
            api
              .descargarPlantillaHabitaciones()
              .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo descargar'))
          }
          onCerrar={() => setModal(null)}
          onImportado={({ resumen, avisos }) => {
            setModal(null);
            setAviso(
              `Importación lista: ${resumen.crear} nuevas, ${resumen.actualizar} actualizadas.` +
                textoAvisos(avisos, 'cambian de tipo y conservan el precio pactado'),
            );
            cargar();
          }}
        />
      )}
    </div>
  );
}
