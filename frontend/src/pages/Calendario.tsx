import { useEffect, useState } from 'react';
import { CalendarCheck, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../api/client';
import type {
  Calendario as DatosCalendario,
  EstadoHabitacion,
  ReservaCalendario,
} from '../api/types';
import { ETIQUETA_ESTADO, ETIQUETA_ESTADO_HABITACION, formatearFecha } from '../formato';
import { sumarDias, ubicar } from '../logica/calendario';

const DIAS_VISIBLES = 14;

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
            <ChevronLeft size={16} /> Anterior
          </button>
          <button className="acento" onClick={() => setDesde(undefined)}>
            <CalendarCheck size={16} /> Hoy
          </button>
          <button className="secundario" onClick={() => setDesde(sumarDias(inicio, DIAS_VISIBLES))}>
            Siguiente <ChevronRight size={16} />
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
          <span className={`badge-estado ${estado}`}>{ETIQUETA_ESTADO_HABITACION[estado]}</span>
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
