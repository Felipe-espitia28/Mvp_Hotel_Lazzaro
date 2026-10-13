import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type {
  Calendario as DatosCalendario,
  EstadoHabitacion,
  ReservaCalendario,
} from '../api/types';
import { ETIQUETA_ESTADO, ETIQUETA_ESTADO_HABITACION, formatearFecha } from '../formato';

const DIAS_VISIBLES = 14;
const MS_DIA = 24 * 60 * 60 * 1000;

const sumarDias = (iso: string, dias: number) =>
  new Date(Date.parse(iso) + dias * MS_DIA).toISOString().slice(0, 10);

const diasEntre = (desde: string, hasta: string) =>
  Math.round((Date.parse(hasta) - Date.parse(desde)) / MS_DIA);

// Columnas que ocupa la reserva dentro del rango visible: una por noche
// (de la entrada a la víspera de la salida), recortada a los bordes.
function ubicar(r: ReservaCalendario, desde: string, dias: number) {
  const inicio = Math.max(0, diasEntre(desde, r.fechaEntrada));
  const fin = Math.min(dias, diasEntre(desde, r.fechaSalida));
  return {
    columna: `${inicio + 2} / ${fin + 2}`,
    sigueAntes: diasEntre(desde, r.fechaEntrada) < 0,
    sigueDespues: diasEntre(desde, r.fechaSalida) > dias,
  };
}

// Vista de ocupación: habitaciones en filas, días en columnas, reservas como barras.
export function Calendario() {
  // undefined = empezar hoy (lo decide el backend con la fecha del hotel).
  const [desde, setDesde] = useState<string | undefined>(undefined);
  const [datos, setDatos] = useState<DatosCalendario | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .calendario(desde, DIAS_VISIBLES)
      .then((d) => {
        setDatos(d);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Error al cargar el calendario'));
  }, [desde]);

  if (!datos) return error ? <div className="mensaje-error">{error}</div> : <p>Cargando...</p>;

  const inicio = datos.desde.slice(0, 10);
  const hoy = datos.hoy.slice(0, 10);
  const dias = Array.from({ length: datos.dias }, (_, i) => sumarDias(inicio, i));
  const columnas = `90px repeat(${datos.dias}, minmax(44px, 1fr))`;

  return (
    <div>
      <div className="barra-titulo">
        <h2>Calendario de ocupación</h2>
        <div className="acciones-tabla">
          <button
            className="secundario"
            onClick={() => setDesde(sumarDias(inicio, -DIAS_VISIBLES))}
          >
            ← Anterior
          </button>
          <button className="secundario" onClick={() => setDesde(undefined)}>
            Hoy
          </button>
          <button className="secundario" onClick={() => setDesde(sumarDias(inicio, DIAS_VISIBLES))}>
            Siguiente →
          </button>
        </div>
      </div>
      {error && <div className="mensaje-error">{error}</div>}

      <div className="leyenda">
        {(['confirmada', 'activa', 'cerrada'] as const).map((estado) => (
          <span key={estado}>
            <span className={`muestra barra-${estado}`} /> {ETIQUETA_ESTADO[estado]}
          </span>
        ))}
      </div>

      <div className="calendario-contenedor">
        <div className="calendario" style={{ gridTemplateColumns: columnas }}>
          <div className="celda-encabezado esquina">Hab.</div>
          {dias.map((dia) => {
            const fecha = new Date(dia);
            return (
              <div key={dia} className={`celda-encabezado ${dia === hoy ? 'es-hoy' : ''}`}>
                <div className="dia-semana">
                  {fecha.toLocaleDateString('es-CO', { weekday: 'short', timeZone: 'UTC' })}
                </div>
                <div>{fecha.getUTCDate()}</div>
              </div>
            );
          })}

          {datos.habitaciones.map((h, fila) => (
            <FilaHabitacion
              key={h.id}
              fila={fila + 2}
              etiqueta={h.numero}
              tipo={h.tipoHabitacion.nombre}
              estado={h.estado}
              dias={dias}
              hoy={hoy}
              reservas={datos.reservas.filter((r) => r.habitacionId === h.id)}
              desde={inicio}
            />
          ))}
        </div>
      </div>
      <p className="texto-secundario">
        Cada barra ocupa las noches de la estadía: el día de salida queda libre para otro huésped.
      </p>
    </div>
  );
}

interface PropsFila {
  fila: number;
  etiqueta: string;
  tipo: string;
  estado: EstadoHabitacion;
  dias: string[];
  hoy: string;
  reservas: ReservaCalendario[];
  desde: string;
}

function FilaHabitacion({ fila, etiqueta, tipo, estado, dias, hoy, reservas, desde }: PropsFila) {
  return (
    <>
      <div className="celda-habitacion" style={{ gridRow: fila }}>
        <strong>{etiqueta}</strong>
        <div className="texto-secundario">{tipo}</div>
        {(estado === 'en_limpieza' || estado === 'fuera_servicio') && (
          <span className={`badge-estado `}>{ETIQUETA_ESTADO_HABITACION[estado]}</span>
        )}
      </div>
      {dias.map((dia, i) => (
        <div
          key={dia}
          className={`celda-dia ${dia === hoy ? 'es-hoy' : ''} ${estado === 'fuera_servicio' ? 'fuera-servicio' : ''}`}
          style={{ gridRow: fila, gridColumn: i + 2 }}
        />
      ))}
      {reservas.map((r) => {
        const { columna, sigueAntes, sigueDespues } = ubicar(r, desde, dias.length);
        return (
          <div
            key={r.id}
            className={`barra-reserva barra-${r.estado} ${sigueAntes ? 'sigue-antes' : ''} ${sigueDespues ? 'sigue-despues' : ''}`}
            style={{ gridRow: fila, gridColumn: columna }}
            title={`${r.huesped.nombre} · ${formatearFecha(r.fechaEntrada)} → ${formatearFecha(r.fechaSalida)} · ${ETIQUETA_ESTADO[r.estado]}`}
          >
            {r.huesped.nombre}
          </div>
        );
      })}
    </>
  );
}
