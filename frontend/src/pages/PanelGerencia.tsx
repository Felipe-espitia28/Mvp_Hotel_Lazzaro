import { useEffect, useState } from 'react';
import { BarChart3, BedDouble, CalendarRange, Coins, TrendingUp, Wallet } from 'lucide-react';
import { api } from '../api/client';
import type { PanelGerencia as DatosGerencia, Pickup, Pronostico, Variacion } from '../api/types';
import {
  ETIQUETA_CATEGORIA,
  formatearDinero,
  formatearFecha,
  formatearFechaHora,
} from '../formato';
import { GraficoOcupacion } from '../components/GraficoOcupacion';
import { Indicador } from '../components/Indicador';
import {
  ETIQUETA_PERIODO,
  periodo,
  textoVariacion,
  type PeriodoRapido,
} from '../logica/indicadores';

interface Props {
  // Abre la reserva de una cuenta por cobrar en Reservas (busca por documento).
  onVerReserva: (documento: string) => void;
}

type Seleccion = PeriodoRapido | 'personalizado';

const hoyLocal = () => new Date().toLocaleDateString('en-CA');

function Comparacion({ valor }: { valor: number | null }) {
  const { texto, tono } = textoVariacion(valor);
  return (
    <span className={`variacion ${tono}`} title="Frente al período anterior de la misma duración">
      {texto}
    </span>
  );
}

// B-1: "¿cómo va el negocio?". Ocupación, ADR, RevPAR e ingresos del período
// (con la comparación frente al anterior), la serie diaria, el pronóstico, el
// pickup y lo que se debe. Solo el admin.
export function PanelGerencia({ onVerReserva }: Props) {
  const [seleccion, setSeleccion] = useState<Seleccion>('este_mes');
  const [rango, setRango] = useState(() => periodo('este_mes', hoyLocal()));
  const [datos, setDatos] = useState<DatosGerencia | null>(null);
  const [pronostico, setPronostico] = useState<Pronostico | null>(null);
  const [pickup, setPickup] = useState<Pickup | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!rango.desde || !rango.hasta || rango.hasta < rango.desde) return;
    let vigente = true;
    api
      .panelGerencia(rango.desde, rango.hasta)
      .then((d) => {
        if (!vigente) return;
        setDatos(d);
        setError(null);
      })
      .catch((e) => vigente && setError(e instanceof Error ? e.message : 'Error al calcular'));
    return () => {
      vigente = false;
    };
  }, [rango]);

  // El pronóstico y el pickup no dependen del período elegido.
  useEffect(() => {
    Promise.all([api.pronostico(30), api.pickup(7)])
      .then(([p, k]) => {
        setPronostico(p);
        setPickup(k);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Error al cargar el pronóstico'));
  }, []);

  function elegir(nueva: Seleccion) {
    setSeleccion(nueva);
    if (nueva !== 'personalizado') setRango(periodo(nueva, hoyLocal()));
  }

  const v: Variacion | undefined = datos?.variacion;
  const actual = datos?.actual;

  return (
    <div>
      <div className="barra-titulo">
        <h2>Cómo va el negocio</h2>
        {datos && (
          <span className="texto-secundario">
            Calculado {formatearFechaHora(datos.calculadoEn)}
          </span>
        )}
      </div>

      <div className="selector-periodo">
        <label htmlFor="periodo-gerencia">Período</label>
        <select
          id="periodo-gerencia"
          value={seleccion}
          onChange={(e) => elegir(e.target.value as Seleccion)}
        >
          {(Object.keys(ETIQUETA_PERIODO) as PeriodoRapido[]).map((p) => (
            <option key={p} value={p}>
              {ETIQUETA_PERIODO[p]}
            </option>
          ))}
          <option value="personalizado">Personalizado</option>
        </select>
        {seleccion === 'personalizado' && (
          <>
            <input
              type="date"
              aria-label="Desde"
              value={rango.desde}
              onChange={(e) => setRango({ ...rango, desde: e.target.value })}
            />
            <input
              type="date"
              aria-label="Hasta"
              value={rango.hasta}
              min={rango.desde}
              onChange={(e) => setRango({ ...rango, hasta: e.target.value })}
            />
          </>
        )}
        {datos && (
          <span className="texto-secundario">
            {formatearFecha(datos.periodo.desde)} → {formatearFecha(datos.periodo.hasta)} (
            {datos.periodo.dias} días) · comparado con {formatearFecha(datos.periodoAnterior.desde)}{' '}
            → {formatearFecha(datos.periodoAnterior.hasta)}
          </span>
        )}
      </div>

      {error && <div className="mensaje-error">{error}</div>}
      {!datos || !actual || !v ? (
        !error && <p>Calculando...</p>
      ) : (
        <>
          <div className="indicadores">
            <Indicador
              titulo="Ocupación"
              valor={`${actual.ocupacion.toLocaleString('es-CO')} %`}
              icono={BedDouble}
              detalle={
                <>
                  <Comparacion valor={v.ocupacion} />
                  <div>
                    {actual.nochesVendidas} de {actual.nochesDisponibles} noches
                  </div>
                </>
              }
            />
            <Indicador
              titulo="ADR (tarifa media)"
              valor={formatearDinero(actual.adr)}
              icono={Coins}
              tono="dorado"
              detalle={<Comparacion valor={v.adr} />}
            />
            <Indicador
              titulo="RevPAR"
              valor={formatearDinero(actual.revpar)}
              icono={TrendingUp}
              tono="verde"
              detalle={
                <>
                  <Comparacion valor={v.revpar} />
                  <div>Por habitación disponible</div>
                </>
              }
            />
            <Indicador
              titulo="Ingresos"
              valor={formatearDinero(actual.ingresoTotal)}
              icono={Wallet}
              tono="dorado"
              detalle={
                <>
                  <Comparacion valor={v.ingresoTotal} />
                  <div className="desglose-ingresos">
                    <span>
                      Alojamiento <strong>{formatearDinero(actual.ingresoAlojamiento)}</strong>
                    </span>
                    <span>
                      Consumos <strong>{formatearDinero(actual.ingresoConsumos)}</strong>
                    </span>
                    <span>
                      Penalidades{' '}
                      <strong>
                        {formatearDinero(actual.cancelaciones.penalidad + actual.noShows.penalidad)}
                      </strong>
                    </span>
                  </div>
                </>
              }
            />
          </div>

          <div className="pila-gerencia">
            <section className="tarjeta">
              <h3 className="tarjeta-titulo">
                <BarChart3 size={18} /> Ocupación por noche del período
              </h3>
              <GraficoOcupacion
                noches={datos.serie}
                hoy={hoyLocal()}
                detalle={(i) => `Alojamiento ${formatearDinero(datos.serie[i].ingreso)}`}
              />
              <p className="texto-secundario">
                Ingresos por noche vendida, sin IVA. Las habitaciones disponibles se cuentan con su
                estado de hoy (no hay histórico de estados).
              </p>
            </section>

            {pronostico && (
              <section className="tarjeta">
                <h3 className="tarjeta-titulo">
                  <CalendarRange size={18} /> Pronóstico de los próximos {pronostico.dias} días
                </h3>
                <GraficoOcupacion noches={pronostico.serie} hoy={pronostico.desde.slice(0, 10)} />
                <p className="texto-secundario">
                  Con las reservas confirmadas y las estadías en curso.
                </p>
              </section>
            )}

            <div className="columnas-panel">
              <section className="tarjeta">
                <h3 className="tarjeta-titulo">Ingresos por clasificación</h3>
                <div className="contenedor-tabla">
                  <table className="tabla">
                    <thead>
                      <tr>
                        <th>Concepto</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Alojamiento</td>
                        <td>{formatearDinero(actual.ingresoAlojamiento)}</td>
                      </tr>
                      {actual.consumosPorClasificacion.map((c) => (
                        <tr key={c.clasificacion}>
                          <td>{ETIQUETA_CATEGORIA[c.clasificacion] ?? c.clasificacion}</td>
                          <td>{formatearDinero(c.total)}</td>
                        </tr>
                      ))}
                      <tr>
                        <td>
                          Cancelaciones ({actual.cancelaciones.cuantas}) y no-shows (
                          {actual.noShows.cuantas})
                        </td>
                        <td>
                          {formatearDinero(
                            actual.cancelaciones.penalidad + actual.noShows.penalidad,
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>

              {pickup && (
                <section className="tarjeta">
                  <h3 className="tarjeta-titulo">Pickup de los últimos {pickup.dias} días</h3>
                  <div className="indicador-valor">{pickup.reservas}</div>
                  <p className="texto-secundario">
                    {pickup.reservas === 1 ? 'reserva creada' : 'reservas creadas'}
                    {pickup.canceladas > 0 && ` (${pickup.canceladas} ya cancelada/s)`} ·{' '}
                    {pickup.noches} noches · {formatearDinero(pickup.ingreso)} de alojamiento
                  </p>
                </section>
              )}
            </div>

            <section className="tarjeta">
              <h3 className="tarjeta-titulo">
                Cuentas por cobrar · {formatearDinero(datos.cuentasPorCobrar.total)}
              </h3>
              {datos.saldosAFavor.total > 0 && (
                <p className="texto-secundario">
                  Saldos a favor de huéspedes por devolver:{' '}
                  {formatearDinero(datos.saldosAFavor.total)} ({datos.saldosAFavor.cuentas.length}).
                </p>
              )}
              {datos.cuentasPorCobrar.cuentas.length === 0 ? (
                <p className="vacio">No hay cuentas pendientes: todo está cobrado.</p>
              ) : (
                <div className="contenedor-tabla">
                  <table className="tabla">
                    <thead>
                      <tr>
                        <th>Huésped</th>
                        <th>Estadía</th>
                        <th>Saldo</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {datos.cuentasPorCobrar.cuentas.map((c) => (
                        <tr key={c.reservaId}>
                          <td>{c.huesped.nombre}</td>
                          <td>
                            Hab. {c.habitacion} · {formatearFecha(c.fechaEntrada)} →{' '}
                            {formatearFecha(c.fechaSalida)}
                          </td>
                          <td>
                            <strong>{formatearDinero(c.saldo)}</strong>
                          </td>
                          <td>
                            <button
                              className="enlace"
                              onClick={() => onVerReserva(c.huesped.documento)}
                            >
                              Ver reserva
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
