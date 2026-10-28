import { useEffect, useState } from 'react';
import { CalendarCheck, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../api/client';
import type {
  Calendario as DatosCalendario,
  EstadoHabitacion,
  ReservaCalendario,
} from '../api/types';
import { ETIQUETA_ESTADO, ETIQUETA_ESTADO_HABITACION, formatearFecha } from '../formato';
import {
  destinoDelArrastre,
  diaBajoElPuntero,
  diasEntre,
  sumarDias,
  ubicar,
} from '../logica/calendario';
import { ModalModificarReserva, type ReservaAModificar } from '../components/ModalModificarReserva';

const DIAS_VISIBLES = 14;

interface Props {
  // A-5: arrastrar una barra abre el modal de modificación (nada se guarda solo).
  puedeModificar: boolean;
  esAdmin: boolean;
}

// La barra que se está arrastrando y el día de la grilla por donde se agarró.
interface Arrastre {
  reserva: ReservaCalendario;
  diaAgarrado: string;
}

interface Modificacion {
  reserva: ReservaAModificar;
  inicial: { fechaEntrada: string; fechaSalida: string; habitacionId: string };
}

// Vista de ocupación: habitaciones en filas, días en columnas, reservas como barras.
export function Calendario({ puedeModificar, esAdmin }: Props) {
  // undefined = empezar hoy (lo decide el backend con la fecha del hotel).
  const [desde, setDesde] = useState<string | undefined>(undefined);
  const [datos, setDatos] = useState<DatosCalendario | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [arrastre, setArrastre] = useState<Arrastre | null>(null);
  // Las barras dejan pasar el puntero mientras se arrastra, para soltar sobre las celdas.
  const [arrastrando, setArrastrando] = useState(false);
  const [modificacion, setModificacion] = useState<Modificacion | null>(null);

  useEffect(() => {
    api
      .calendario(desde, DIAS_VISIBLES)
      .then((d) => {
        setDatos(d);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Error al cargar el calendario'));
  }, [desde, version]);

  if (!datos) return error ? <div className="mensaje-error">{error}</div> : <p>Cargando...</p>;

  const inicio = datos.desde.slice(0, 10);
  const hoy = datos.hoy.slice(0, 10);
  const dias = Array.from({ length: datos.dias }, (_, i) => sumarDias(inicio, i));
  const columnas = `90px repeat(${datos.dias}, minmax(44px, 1fr))`;

  function agarrar(reserva: ReservaCalendario, diaAgarrado: string) {
    setArrastre({ reserva, diaAgarrado });
    // En el siguiente ciclo: si la barra deja de recibir el puntero justo al
    // empezar, el navegador cancela el arrastre.
    setTimeout(() => setArrastrando(true), 0);
  }

  function terminarArrastre() {
    setArrastre(null);
    setArrastrando(false);
  }

  function soltar(dia: string, habitacionId: string) {
    if (!arrastre) return;
    const { reserva, diaAgarrado } = arrastre;
    terminarArrastre();
    const destino = destinoDelArrastre(reserva, diaAgarrado, dia, habitacionId);
    if (!destino.cambia) return;
    setAviso(null);
    setModificacion({
      reserva,
      inicial: {
        fechaEntrada: destino.fechaEntrada,
        fechaSalida: destino.fechaSalida,
        habitacionId: destino.habitacionId,
      },
    });
  }

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
      {aviso && <div className="mensaje-exito">{aviso}</div>}

      <div className="leyenda">
        {(['confirmada', 'activa', 'cerrada'] as const).map((estado) => (
          <span key={estado}>
            <span className={`muestra barra-${estado}`} /> {ETIQUETA_ESTADO[estado]}
          </span>
        ))}
      </div>

      <div className="calendario-contenedor">
        <div
          className={`calendario ${arrastrando ? 'arrastrando' : ''}`}
          style={{ gridTemplateColumns: columnas }}
        >
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
              arrastrable={puedeModificar}
              onAgarrar={agarrar}
              onSoltar={(dia) => soltar(dia, h.id)}
              onTerminar={terminarArrastre}
            />
          ))}
        </div>
      </div>
      <p className="texto-secundario">
        Cada barra ocupa las noches de la estadía: el día de salida queda libre para otro huésped.
        {puedeModificar &&
          ' Arrastra una reserva a otras fechas (en horizontal) o a otra habitación (en vertical) para modificarla: verás la diferencia de precio antes de confirmar.'}
      </p>

      {modificacion && (
        <ModalModificarReserva
          reserva={modificacion.reserva}
          inicial={modificacion.inicial}
          esAdmin={esAdmin}
          onCerrar={() => setModificacion(null)}
          onModificada={(mensaje) => {
            setModificacion(null);
            setAviso(mensaje);
            setVersion((v) => v + 1);
          }}
        />
      )}
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
  arrastrable: boolean;
  onAgarrar: (reserva: ReservaCalendario, diaAgarrado: string) => void;
  onSoltar: (dia: string) => void;
  onTerminar: () => void;
}

function FilaHabitacion({
  fila,
  etiqueta,
  tipo,
  estado,
  dias,
  hoy,
  reservas,
  desde,
  arrastrable,
  onAgarrar,
  onSoltar,
  onTerminar,
}: PropsFila) {
  const ultimoDia = sumarDias(desde, dias.length);
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
          onDragOver={(e) => arrastrable && e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            onSoltar(dia);
          }}
        />
      ))}
      {reservas.map((r) => {
        const { columna, sigueAntes, sigueDespues } = ubicar(r, desde, dias.length);
        // Solo se mueven las reservas por llegar y las estadías en curso.
        const movible = arrastrable && (r.estado === 'confirmada' || r.estado === 'activa');
        // El primer día visible de la barra y hasta dónde llega dentro del rango.
        const entrada = r.fechaEntrada.slice(0, 10);
        const salida = r.fechaSalida.slice(0, 10);
        const primerDia = entrada < desde ? desde : entrada;
        const fin = salida > ultimoDia ? ultimoDia : salida;
        return (
          <div
            key={r.id}
            draggable={movible}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', r.id);
              const caja = e.currentTarget.getBoundingClientRect();
              onAgarrar(
                r,
                diaBajoElPuntero(
                  primerDia,
                  Math.max(1, diasEntre(primerDia, fin)),
                  e.clientX - caja.left,
                  caja.width,
                ),
              );
            }}
            onDragEnd={onTerminar}
            className={`barra-reserva barra-${r.estado} ${sigueAntes ? 'sigue-antes' : ''} ${sigueDespues ? 'sigue-despues' : ''} ${movible ? 'movible' : ''}`}
            style={{ gridRow: fila, gridColumn: columna }}
            title={`${r.huesped.nombre} · ${formatearFecha(r.fechaEntrada)} → ${formatearFecha(r.fechaSalida)} · ${ETIQUETA_ESTADO[r.estado]}${movible ? ' · arrastra para modificarla' : ''}`}
          >
            {r.huesped.nombre}
          </div>
        );
      })}
    </>
  );
}
