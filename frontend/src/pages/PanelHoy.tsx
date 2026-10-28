import { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  BedDouble,
  CircleDollarSign,
  ClipboardCheck,
  DoorClosed,
  DoorOpen,
  LineChart,
  LogIn,
  LogOut,
  PiggyBank,
  Sparkles,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../api/client';
import type { PanelHoy as DatosPanel, ReservaPendiente } from '../api/types';
import { formatearDinero, formatearFecha, formatearFechaHora } from '../formato';
import { ModalCheckOut } from '../components/ModalCheckOut';
import { ModalCheckIn } from '../components/ModalCheckIn';
import { GraficoOcupacion } from '../components/GraficoOcupacion';
import { iniciales } from '../components/Marca';
import { Indicador } from '../components/Indicador';
import { ocupacionPorNoche, type NocheOcupacion } from '../logica/ocupacion';
import { avisoCheckOut } from '../logica/pagos';
import { PanelGerencia } from './PanelGerencia';

const NOCHES_GRAFICO = 14;

interface Props {
  // Recepción y admin pueden hacer check-in/out desde el panel.
  puedeOperar: boolean;
  // A-1: el admin puede cerrar el check-out con saldo pendiente.
  puedeCerrarConSaldo: boolean;
  // B-1: la pestaña "Gerencia" (indicadores del negocio) es solo del admin.
  puedeVerGerencia: boolean;
  // B-1: desde las cuentas por cobrar, abre la reserva en Reservas.
  onVerReserva: (documento: string) => void;
}

type Vista = 'recepcion' | 'gerencia';

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

// Primera pantalla del día. B-1: recepción responde "¿qué tengo que hacer
// hoy?" y gerencia, "¿cómo va el negocio?".
export function PanelHoy({ puedeVerGerencia, onVerReserva, ...props }: Props) {
  const [vista, setVista] = useState<Vista>('recepcion');
  const pestanas: { id: Vista; titulo: string; icono: LucideIcon }[] = [
    { id: 'recepcion', titulo: 'Recepción', icono: ClipboardCheck },
    { id: 'gerencia', titulo: 'Gerencia', icono: LineChart },
  ];
  return (
    <div>
      {puedeVerGerencia && (
        <div className="pestanas" role="tablist" aria-label="Vistas del panel">
          {pestanas.map(({ id, titulo, icono: Icono }) => (
            <button
              key={id}
              role="tab"
              aria-selected={vista === id}
              className={`pestana ${vista === id ? 'activa' : ''}`}
              onClick={() => setVista(id)}
            >
              <Icono size={16} /> {titulo}
            </button>
          ))}
        </div>
      )}
      <div role={puedeVerGerencia ? 'tabpanel' : undefined}>
        {vista === 'gerencia' && puedeVerGerencia ? (
          <PanelGerencia onVerReserva={onVerReserva} />
        ) : (
          <PanelRecepcion {...props} />
        )}
      </div>
    </div>
  );
}

function PanelRecepcion({
  puedeOperar,
  puedeCerrarConSaldo,
}: Pick<Props, 'puedeOperar' | 'puedeCerrarConSaldo'>) {
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
  // B-1: lo que hay que cobrar antes de que se vayan.
  const conSaldo = datos.salidas.filter((r) => r.saldo > 0);
  const porLimpiar = datos.habitaciones.porLimpiarLista.map((h) => h.numero);

  return (
    <div>
      <div className="barra-titulo">
        <h2>Resumen del día</h2>
        <span className="texto-secundario">Calculado {formatearFechaHora(datos.calculadoEn)}</span>
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
            <div className="texto-secundario">Por noche vendida, sin IVA</div>
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
            [
              porLimpiar.length > 0 && `Hab. ${porLimpiar.join(', ')}`,
              datos.habitaciones.fueraDeServicio > 0 &&
                `${datos.habitaciones.fueraDeServicio} fuera de servicio`,
            ]
              .filter(Boolean)
              .join(' · ') || undefined
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
          <ListaPendientes
            titulo="Saldos por cobrar de hoy"
            icono={CircleDollarSign}
            vacio="Los que salen hoy no deben nada."
            reservas={conSaldo}
            textoAtrasada="Salida vencida"
            detalle={(r) =>
              `Saldo ${formatearDinero(conSaldo.find((s) => s.id === r.id)?.saldo ?? 0)}`
            }
            accion={null}
            procesando={procesando}
            onAccion={setCheckOutDe}
          />
          <ListaPendientes
            titulo="Anticipos pendientes"
            icono={PiggyBank}
            vacio="No hay llegadas próximas sin anticipo."
            reservas={datos.anticiposPendientes}
            textoAtrasada="Debía llegar ayer"
            detalle={(r) =>
              `Llega ${formatearFecha(r.fechaEntrada)} · sugerido ${formatearDinero(r.anticipoSugerido ?? 0)}`
            }
            accion={null}
            procesando={procesando}
            onAccion={setCheckInDe}
            sinMarcaAnticipo
          />
        </div>
      </div>

      {checkInDe && (
        <ModalCheckIn
          reserva={checkInDe}
          onCerrar={() => setCheckInDe(null)}
          onHecho={async ({ avisos }) => {
            setCheckInDe(null);
            setError(null);
            setAviso(
              [
                `Check-in de ${checkInDe.huesped.nombre} en la habitación ${checkInDe.habitacion.numero}.`,
                ...avisos,
              ].join(' '),
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
          puedeCerrarConSaldo={puedeCerrarConSaldo}
          onCerrar={() => setCheckOutDe(null)}
          onLiquidada={async (cerrada) => {
            setCheckOutDe(null);
            setError(null);
            setAviso(avisoCheckOut(checkOutDe.huesped.nombre, cerrada));
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
  // La lista de anticipos pendientes no repite la marca en cada fila.
  sinMarcaAnticipo?: boolean;
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
                {r.anticipoPendiente && !props.sinMarcaAnticipo && (
                  <span className="etiqueta-atrasada"> · Anticipo pendiente</span>
                )}
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
