import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { PanelHoy as DatosPanel, ReservaPendiente } from '../api/types';
import { formatearDinero, formatearFecha } from '../formato';
import { ModalCheckOut } from '../components/ModalCheckOut';

interface Props {
  // Recepción y admin pueden hacer check-in/out desde el panel.
  puedeOperar: boolean;
}

function Indicador({
  titulo,
  valor,
  detalle,
}: {
  titulo: string;
  valor: string;
  detalle?: string;
}) {
  return (
    <div className="indicador">
      <div className="indicador-titulo">{titulo}</div>
      <div className="indicador-valor">{valor}</div>
      {detalle && <div className="texto-secundario">{detalle}</div>}
    </div>
  );
}

// Primera pantalla del día: cómo está el hotel y qué hay que hacer hoy.
export function PanelHoy({ puedeOperar }: Props) {
  const [datos, setDatos] = useState<DatosPanel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [checkOutDe, setCheckOutDe] = useState<ReservaPendiente | null>(null);

  const cargar = useCallback(async () => {
    try {
      setDatos(await api.panelHoy());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar el panel');
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function hacerCheckIn(r: ReservaPendiente) {
    setError(null);
    setAviso(null);
    setProcesando(r.id);
    try {
      await api.checkIn(r.id);
      setAviso(`Check-in de ${r.huesped.nombre} en la habitación ${r.habitacion.numero}.`);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ocurrió un error');
    } finally {
      setProcesando(null);
    }
  }

  if (!datos) return error ? <div className="mensaje-error">{error}</div> : <p>Cargando...</p>;

  const { ocupacion, ingresosDelMes } = datos;
  const mes = new Date(datos.fecha).toLocaleDateString('es-CO', { month: 'long', timeZone: 'UTC' });

  return (
    <div>
      <h2>
        Hoy{' '}
        <span className="texto-secundario">
          {new Date(datos.fecha).toLocaleDateString('es-CO', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            timeZone: 'UTC',
          })}
        </span>
      </h2>
      {error && <div className="mensaje-error">{error}</div>}
      {aviso && <div className="mensaje-exito">{aviso}</div>}

      <div className="indicadores">
        <Indicador
          titulo="Ocupación esta noche"
          valor={`${ocupacion.porcentaje}%`}
          detalle={`${ocupacion.habitacionesOcupadas} de ${ocupacion.totalHabitaciones} habitaciones`}
        />
        <Indicador titulo="Huéspedes alojados" valor={String(datos.huespedesAlojados)} />
        <Indicador titulo="Llegadas pendientes" valor={String(datos.llegadas.length)} />
        <Indicador titulo="Salidas pendientes" valor={String(datos.salidas.length)} />
        <Indicador
          titulo="Por limpiar"
          valor={String(datos.habitaciones.porLimpiar)}
          detalle={
            datos.habitaciones.fueraDeServicio > 0
              ? `${datos.habitaciones.fueraDeServicio} fuera de servicio`
              : undefined
          }
        />
        <Indicador
          titulo={`Ingresos de ${mes}`}
          valor={formatearDinero(ingresosDelMes.total)}
          detalle={`Alojamiento ${formatearDinero(ingresosDelMes.alojamiento)} · Consumos ${formatearDinero(ingresosDelMes.consumos)} · Penalidades ${formatearDinero(ingresosDelMes.penalidades)}`}
        />
      </div>

      <div className="columnas-panel">
        <ListaPendientes
          titulo="Llegadas"
          vacio="No hay llegadas pendientes."
          reservas={datos.llegadas}
          textoAtrasada="Debía llegar ayer"
          detalle={(r) => `Hasta ${formatearFecha(r.fechaSalida)}`}
          accion={puedeOperar ? 'Check-in' : null}
          procesando={procesando}
          onAccion={hacerCheckIn}
        />
        <ListaPendientes
          titulo="Salidas"
          vacio="No hay salidas pendientes."
          reservas={datos.salidas}
          textoAtrasada="Salida vencida"
          detalle={(r) => `Alojamiento ${formatearDinero(r.valorAlojamiento)} + consumos`}
          accion={puedeOperar ? 'Check-out' : null}
          procesando={procesando}
          onAccion={setCheckOutDe}
        />
      </div>

      {checkOutDe && (
        <ModalCheckOut
          reservaId={checkOutDe.id}
          huesped={checkOutDe.huesped.nombre}
          habitacion={checkOutDe.habitacion.numero}
          onCerrar={() => setCheckOutDe(null)}
          onLiquidada={async (cerrada) => {
            setCheckOutDe(null);
            setError(null);
            setAviso(
              `Check-out de ${checkOutDe.huesped.nombre}: total ${formatearDinero(cerrada.total!)}.`,
            );
            await cargar();
          }}
        />
      )}
    </div>
  );
}

interface PropsLista {
  titulo: string;
  vacio: string;
  reservas: ReservaPendiente[];
  textoAtrasada: string;
  detalle: (r: ReservaPendiente) => string;
  accion: string | null;
  procesando: string | null;
  onAccion: (r: ReservaPendiente) => void;
}

function ListaPendientes(props: PropsLista) {
  return (
    <section className="lista-panel">
      <h3>
        {props.titulo} <span className="texto-secundario">({props.reservas.length})</span>
      </h3>
      {props.reservas.length === 0 ? (
        <p className="texto-secundario">{props.vacio}</p>
      ) : (
        props.reservas.map((r) => (
          <div key={r.id} className={`item-panel ${r.atrasada ? 'atrasada' : ''}`}>
            <div className="item-habitacion">{r.habitacion.numero}</div>
            <div className="item-datos">
              <strong>{r.huesped.nombre}</strong>
              <div className="texto-secundario">
                {props.detalle(r)}
                {r.atrasada && <span className="etiqueta-atrasada"> · {props.textoAtrasada}</span>}
              </div>
            </div>
            {props.accion && (
              <button
                className="primario"
                disabled={props.procesando === r.id}
                onClick={() => props.onAccion(r)}
              >
                {props.accion}
              </button>
            )}
          </div>
        ))
      )}
    </section>
  );
}
