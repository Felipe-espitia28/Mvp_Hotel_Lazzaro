import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  BarChart3,
  BedDouble,
  DoorClosed,
  DoorOpen,
  LogIn,
  LogOut,
  Sparkles,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../api/client';
import type { PanelHoy as DatosPanel, ReservaPendiente } from '../api/types';
import { formatearDinero, formatearFecha } from '../formato';
import { ModalCheckOut } from '../components/ModalCheckOut';
import { ModalCheckIn } from '../components/ModalCheckIn';
import { GraficoOcupacion } from '../components/GraficoOcupacion';
import { iniciales } from '../components/Marca';
import { ocupacionPorNoche, type NocheOcupacion } from '../logica/ocupacion';

const NOCHES_GRAFICO = 14;

interface Props {
  // Recepción y admin pueden hacer check-in/out desde el panel.
  puedeOperar: boolean;
}

function Indicador({
  titulo,
  valor,
  detalle,
  icono: Icono,
  tono,
}: {
  titulo: string;
  valor: string;
  detalle?: ReactNode;
  icono: LucideIcon;
  tono?: 'dorado' | 'verde' | 'ambar';
}) {
  return (
    <div className="indicador">
      <div className={`indicador-icono ${tono ?? ''}`}>
        <Icono size={20} />
      </div>
      <div>
        <div className="indicador-titulo">{titulo}</div>
        <div className="indicador-valor">{valor}</div>
        {detalle && <div className="texto-secundario">{detalle}</div>}
      </div>
    </div>
  );
}

// Anillo de progreso para la ocupación de esta noche.
function Anillo({ porcentaje }: { porcentaje: number }) {
  const radio = 30;
  const circunferencia = 2 * Math.PI * radio;
  return (
    <svg className="anillo" width="76" height="76" viewBox="0 0 76 76" aria-hidden>
      <circle className="anillo-fondo" cx="38" cy="38" r={radio} fill="none" strokeWidth="8" />
      <circle
        className="anillo-valor"
        cx="38"
        cy="38"
        r={radio}
        fill="none"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${(porcentaje / 100) * circunferencia} ${circunferencia}`}
        transform="rotate(-90 38 38)"
      />
    </svg>
  );
}

// Primera pantalla del día: cómo está el hotel y qué hay que hacer hoy.
export function PanelHoy({ puedeOperar }: Props) {
  const [datos, setDatos] = useState<DatosPanel | null>(null);
  const [noches, setNoches] = useState<NocheOcupacion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [checkInDe, setCheckInDe] = useState<ReservaPendiente | null>(null);
  const [checkOutDe, setCheckOutDe] = useState<ReservaPendiente | null>(null);
  const procesando = checkInDe?.id ?? checkOutDe?.id ?? null;

  const cargar = useCallback(async () => {
    try {
      const [panel, calendario] = await Promise.all([
        api.panelHoy(),
        api.calendario(undefined, NOCHES_GRAFICO),
      ]);
      setDatos(panel);
      setNoches(
        ocupacionPorNoche(
          calendario.habitaciones,
          calendario.reservas,
          calendario.desde.slice(0, 10),
          calendario.dias,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar el panel');
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (!datos) return error ? <div className="mensaje-error">{error}</div> : <p>Cargando...</p>;

  const { ocupacion, ingresosDelMes } = datos;
  const fecha = new Date(datos.fecha);
  const mes = fecha.toLocaleDateString('es-CO', { month: 'long', timeZone: 'UTC' });

  return (
    <div>
      <div className="barra-titulo">
        <h2>Resumen del día</h2>
      </div>
      {error && <div className="mensaje-error">{error}</div>}
      {aviso && <div className="mensaje-exito">{aviso}</div>}

      <div className="indicadores">
        <div className="indicador destacado ancho-doble">
          <Anillo porcentaje={ocupacion.porcentaje} />
          <div>
            <div className="indicador-titulo">Ocupación esta noche</div>
            <div className="indicador-valor">{ocupacion.porcentaje}%</div>
            <div className="texto-secundario">
              {ocupacion.habitacionesOcupadas} de {ocupacion.totalHabitaciones} habitaciones en
              servicio
            </div>
          </div>
        </div>
        <div className="indicador ancho-doble">
          <div className="indicador-icono dorado">
            <Wallet size={20} />
          </div>
          <div>
            <div className="indicador-titulo">Ingresos de {mes}</div>
            <div className="indicador-valor">{formatearDinero(ingresosDelMes.total)}</div>
            <div className="desglose-ingresos">
              <span>
                Alojamiento <strong>{formatearDinero(ingresosDelMes.alojamiento)}</strong>
              </span>
              <span>
                Consumos <strong>{formatearDinero(ingresosDelMes.consumos)}</strong>
              </span>
              <span>
                Penalidades <strong>{formatearDinero(ingresosDelMes.penalidades)}</strong>
              </span>
            </div>
          </div>
        </div>
        <Indicador titulo="Alojados" valor={String(datos.huespedesAlojados)} icono={BedDouble} />
        <Indicador
          titulo="Llegadas"
          valor={String(datos.llegadas.length)}
          icono={DoorOpen}
          tono="verde"
        />
        <Indicador titulo="Salidas" valor={String(datos.salidas.length)} icono={DoorClosed} />
        <Indicador
          titulo="Por limpiar"
          valor={String(datos.habitaciones.porLimpiar)}
          icono={Sparkles}
          tono="ambar"
          detalle={
            datos.habitaciones.fueraDeServicio > 0
              ? `${datos.habitaciones.fueraDeServicio} fuera de servicio`
              : undefined
          }
        />
      </div>

      <div className="panel-cuerpo">
        <section className="tarjeta">
          <h3 className="tarjeta-titulo">
            <BarChart3 size={18} /> Ocupación próximas {NOCHES_GRAFICO} noches
          </h3>
          <GraficoOcupacion noches={noches} hoy={datos.fecha.slice(0, 10)} />
        </section>

        <div className="columnas-panel">
          <ListaPendientes
            titulo="Llegadas"
            icono={LogIn}
            vacio="No hay llegadas pendientes."
            reservas={datos.llegadas}
            textoAtrasada="Debía llegar ayer"
            detalle={(r) => `Hasta ${formatearFecha(r.fechaSalida)}`}
            accion={puedeOperar ? 'Check-in' : null}
            procesando={procesando}
            onAccion={setCheckInDe}
          />
          <ListaPendientes
            titulo="Salidas"
            icono={LogOut}
            vacio="No hay salidas pendientes."
            reservas={datos.salidas}
            textoAtrasada="Salida vencida"
            detalle={(r) => `Alojamiento ${formatearDinero(r.valorAlojamiento)} + consumos`}
            accion={puedeOperar ? 'Check-out' : null}
            procesando={procesando}
            onAccion={setCheckOutDe}
          />
        </div>
      </div>

      {checkInDe && (
        <ModalCheckIn
          reserva={checkInDe}
          onCerrar={() => setCheckInDe(null)}
          onHecho={async () => {
            setCheckInDe(null);
            setError(null);
            setAviso(
              `Check-in de ${checkInDe.huesped.nombre} en la habitación ${checkInDe.habitacion.numero}.`,
            );
            await cargar();
          }}
        />
      )}

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
  icono: LucideIcon;
  vacio: string;
  reservas: ReservaPendiente[];
  textoAtrasada: string;
  detalle: (r: ReservaPendiente) => string;
  accion: string | null;
  procesando: string | null;
  onAccion: (r: ReservaPendiente) => void;
}

function ListaPendientes(props: PropsLista) {
  const { icono: Icono } = props;
  return (
    <section className="lista-panel">
      <h3>
        <Icono size={18} /> {props.titulo} <span className="contador">{props.reservas.length}</span>
      </h3>
      {props.reservas.length === 0 ? (
        <p className="texto-secundario">{props.vacio}</p>
      ) : (
        props.reservas.map((r) => (
          <div key={r.id} className={`item-panel ${r.atrasada ? 'atrasada' : ''}`}>
            <div className="avatar claro">{iniciales(r.huesped.nombre)}</div>
            <div className="item-datos">
              <strong>{r.huesped.nombre}</strong>
              <div className="texto-secundario">
                Hab. {r.habitacion.numero} · {props.detalle(r)}
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
