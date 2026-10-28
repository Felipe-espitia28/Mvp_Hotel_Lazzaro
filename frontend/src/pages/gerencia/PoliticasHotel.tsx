import { useEffect, useState, type FormEvent } from 'react';
import { Baby, Ban, Clock, CreditCard, Percent, Save, CalendarRange, Wallet } from 'lucide-react';
import { api } from '../../api/client';
import type { MedioPagoHabilitado, PoliticasHotel as Politicas } from '../../api/types';
import { useHotel } from '../../contexto/HotelActual';
import { ETIQUETA_MEDIO_PAGO, formatearHora } from '../../formato';
import { resumenRangos } from '../../logica/edades';

const HORAS = Array.from({ length: 24 }, (_, h) => h);
const MEDIOS: MedioPagoHabilitado[] = ['efectivo', 'tarjeta', 'transferencia'];

// Multiplicador ↔ porcentaje sobre la tarifa base (1,15 ↔ +15 %).
const aPorcentaje = (factor: number) => Math.round((factor - 1) * 100);
const aFactor = (porcentaje: number) => Math.round((1 + porcentaje / 100) * 100) / 100;

// Reglas del hotel: horarios, cancelación, impuestos, temporadas y pagos.
// Aplican a las reservas nuevas; las existentes conservan lo pactado.
export function PoliticasHotel() {
  const { hotel, recargar } = useHotel();
  const [p, setP] = useState<Politicas | null>(hotel?.politicas ?? null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  // El formulario parte de las políticas vigentes (y se rehace si el hotel
  // termina de cargar después, o al guardar).
  const vigentes = hotel?.politicas;
  useEffect(() => {
    if (vigentes) setP(vigentes);
  }, [vigentes]);

  if (!p) return <p>Cargando...</p>;

  const cambiar = (cambios: Partial<Politicas>) => {
    setAviso(null);
    setP({ ...p, ...cambios });
  };
  const numero = (valor: string) => (valor === '' ? 0 : Number(valor));

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    setGuardando(true);
    try {
      await api.actualizarPoliticas({
        horaCheckIn: p!.horaCheckIn,
        horaCheckOut: p!.horaCheckOut,
        estadiaMaximaNoches: p!.estadiaMaximaNoches,
        antelacionMaximaDias: p!.antelacionMaximaDias,
        horasCancelacionGratuita: p!.horasCancelacionGratuita,
        nochesPenalidad: p!.nochesPenalidad,
        multiplicadorTemporada: p!.multiplicadorTemporada,
        ivaPorcentaje: p!.ivaPorcentaje,
        exencionIvaPasaporte: p!.exencionIvaPasaporte,
        mediosPago: p!.mediosPago,
        edadMaximaNinoGratis: p!.edadMaximaNinoGratis,
        edadMaximaNino: p!.edadMaximaNino,
        anticipoPorcentaje: p!.anticipoPorcentaje,
        anticipoObligatorio: p!.anticipoObligatorio,
      });
      await recargar();
      setAviso('Políticas guardadas. Aplican a las reservas que se hagan desde ahora.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron guardar las políticas');
    } finally {
      setGuardando(false);
    }
  }

  const noches = (n: number) => `${n} ${n === 1 ? 'noche' : 'noches'}`;
  const penalidad =
    p.nochesPenalidad === 0 ? 'no pagan penalidad' : `pagan ${noches(p.nochesPenalidad)}`;

  return (
    <form onSubmit={guardar}>
      {error && <div className="mensaje-error">{error}</div>}
      {aviso && <div className="mensaje-exito">{aviso}</div>}

      <div className="resumen-politicas" aria-live="polite">
        <strong>Así funciona tu hotel:</strong> check-in desde las {formatearHora(p.horaCheckIn)} y
        check-out hasta las {formatearHora(p.horaCheckOut)}; los huéspedes cancelan gratis hasta{' '}
        {p.horasCancelacionGratuita} h antes de su llegada y después {penalidad}. IVA del{' '}
        {p.ivaPorcentaje} %
        {p.exencionIvaPasaporte ? ' (exentos los extranjeros con pasaporte)' : ''}. Por edad:{' '}
        {resumenRangos(p.edadMaximaNinoGratis, p.edadMaximaNino)}.
      </div>

      <div className="grid-politicas">
        <section className="tarjeta">
          <h3 className="tarjeta-titulo">
            <Clock size={18} /> Horarios
          </h3>
          <div className="fila-campos">
            <div className="campo crece">
              <label htmlFor="pol-check-in">Check-in desde</label>
              <select
                id="pol-check-in"
                value={p.horaCheckIn}
                onChange={(e) => cambiar({ horaCheckIn: Number(e.target.value) })}
              >
                {HORAS.map((h) => (
                  <option key={h} value={h}>
                    {formatearHora(h)}
                  </option>
                ))}
              </select>
            </div>
            <div className="campo crece">
              <label htmlFor="pol-check-out">Check-out hasta</label>
              <select
                id="pol-check-out"
                value={p.horaCheckOut}
                onChange={(e) => cambiar({ horaCheckOut: Number(e.target.value) })}
              >
                {HORAS.map((h) => (
                  <option key={h} value={h}>
                    {formatearHora(h)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="texto-secundario">
            Un huésped que no llega antes del check-out del día siguiente queda como no-show.
          </p>
        </section>

        <section className="tarjeta">
          <h3 className="tarjeta-titulo">
            <Ban size={18} /> Cancelación
          </h3>
          <div className="fila-campos">
            <div className="campo crece">
              <label htmlFor="pol-horas">Gratis hasta (horas antes de la llegada)</label>
              <input
                id="pol-horas"
                type="number"
                min={0}
                max={720}
                value={p.horasCancelacionGratuita}
                onChange={(e) => cambiar({ horasCancelacionGratuita: numero(e.target.value) })}
              />
            </div>
            <div className="campo crece">
              <label htmlFor="pol-penalidad">Penalidad después</label>
              <select
                id="pol-penalidad"
                value={p.nochesPenalidad}
                onChange={(e) => cambiar({ nochesPenalidad: Number(e.target.value) })}
              >
                <option value={0}>Sin penalidad</option>
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {noches(n)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="texto-secundario">También es lo que se cobra en un no-show.</p>
        </section>

        <section className="tarjeta">
          <h3 className="tarjeta-titulo">
            <CalendarRange size={18} /> Estadías y temporadas
          </h3>
          <div className="fila-campos">
            <div className="campo crece">
              <label htmlFor="pol-estadia">Estadía máxima (noches)</label>
              <input
                id="pol-estadia"
                type="number"
                min={1}
                max={365}
                value={p.estadiaMaximaNoches}
                onChange={(e) => cambiar({ estadiaMaximaNoches: numero(e.target.value) })}
              />
            </div>
            <div className="campo crece">
              <label htmlFor="pol-antelacion">Se reserva hasta (días antes)</label>
              <input
                id="pol-antelacion"
                type="number"
                min={1}
                max={730}
                value={p.antelacionMaximaDias}
                onChange={(e) => cambiar({ antelacionMaximaDias: numero(e.target.value) })}
              />
            </div>
          </div>
          <div className="fila-campos">
            <div className="campo crece">
              <label htmlFor="pol-media">Temporada media (% sobre la tarifa base)</label>
              <input
                id="pol-media"
                type="number"
                min={-50}
                max={400}
                value={aPorcentaje(p.multiplicadorTemporada.media)}
                onChange={(e) =>
                  cambiar({
                    multiplicadorTemporada: {
                      ...p.multiplicadorTemporada,
                      media: aFactor(numero(e.target.value)),
                    },
                  })
                }
              />
            </div>
            <div className="campo crece">
              <label htmlFor="pol-alta">Temporada alta (% sobre la tarifa base)</label>
              <input
                id="pol-alta"
                type="number"
                min={-50}
                max={400}
                value={aPorcentaje(p.multiplicadorTemporada.alta)}
                onChange={(e) =>
                  cambiar({
                    multiplicadorTemporada: {
                      ...p.multiplicadorTemporada,
                      alta: aFactor(numero(e.target.value)),
                    },
                  })
                }
              />
            </div>
          </div>
        </section>

        <section className="tarjeta">
          <h3 className="tarjeta-titulo">
            <Percent size={18} /> Impuestos
          </h3>
          <div className="campo">
            <label htmlFor="pol-iva">IVA sobre el alojamiento (%)</label>
            <input
              id="pol-iva"
              type="number"
              min={0}
              max={30}
              step={0.5}
              value={p.ivaPorcentaje}
              onChange={(e) => cambiar({ ivaPorcentaje: numero(e.target.value) })}
            />
          </div>
          <label className="casilla">
            <input
              type="checkbox"
              checked={p.exencionIvaPasaporte}
              onChange={(e) => cambiar({ exencionIvaPasaporte: e.target.checked })}
            />
            Extranjeros con pasaporte exentos de IVA
          </label>
          <p className="texto-secundario">⚖️ Confírmalo con tu contador antes de usarlo.</p>
        </section>

        <section className="tarjeta">
          <h3 className="tarjeta-titulo">
            <Baby size={18} /> Niños
          </h3>
          <div className="fila-campos">
            <div className="campo">
              <label htmlFor="pol-nino-gratis">No pagan hasta los (años)</label>
              <input
                id="pol-nino-gratis"
                type="number"
                min={0}
                max={17}
                value={p.edadMaximaNinoGratis}
                onChange={(e) => cambiar({ edadMaximaNinoGratis: numero(e.target.value) })}
              />
            </div>
            <div className="campo">
              <label htmlFor="pol-nino">Tarifa de niño hasta los (años)</label>
              <input
                id="pol-nino"
                type="number"
                min={0}
                max={17}
                value={p.edadMaximaNino}
                onChange={(e) => cambiar({ edadMaximaNino: numero(e.target.value) })}
              />
            </div>
          </div>
          <p className="texto-secundario" aria-live="polite">
            {p.edadMaximaNinoGratis > p.edadMaximaNino
              ? 'La edad de los niños que no pagan no puede superar la de la tarifa de niño'
              : resumenRangos(p.edadMaximaNinoGratis, p.edadMaximaNino)}
            . La edad se toma el día de la entrada; el cargo por niño se define en cada tipo de
            habitación.
          </p>
        </section>

        <section className="tarjeta">
          <h3 className="tarjeta-titulo">
            <Wallet size={18} /> Anticipo
          </h3>
          <div className="campo">
            <label htmlFor="pol-anticipo">Anticipo sugerido (% del total de la reserva)</label>
            <input
              id="pol-anticipo"
              type="number"
              min={0}
              max={100}
              value={p.anticipoPorcentaje}
              onChange={(e) => cambiar({ anticipoPorcentaje: numero(e.target.value) })}
            />
          </div>
          <label className="casilla">
            <input
              type="checkbox"
              checked={p.anticipoObligatorio}
              onChange={(e) => cambiar({ anticipoObligatorio: e.target.checked })}
            />
            Anticipo obligatorio
          </label>
          <p className="texto-secundario">
            Obligatorio solo marca "anticipo pendiente" en las reservas que llegan en los próximos 7
            días sin anticipo; no bloquea la reserva. Al cancelar, el anticipo se aplica a la
            penalidad y lo que sobra se devuelve.
          </p>
        </section>

        <section className="tarjeta">
          <h3 className="tarjeta-titulo">
            <CreditCard size={18} /> Medios de pago
          </h3>
          <p className="texto-secundario">Los que el hotel recibe en el check-out.</p>
          {MEDIOS.map((m) => (
            <label key={m} className="casilla">
              <input
                type="checkbox"
                checked={p.mediosPago.includes(m)}
                onChange={(e) =>
                  cambiar({
                    mediosPago: e.target.checked
                      ? [...p.mediosPago, m]
                      : p.mediosPago.filter((x) => x !== m),
                  })
                }
              />
              {ETIQUETA_MEDIO_PAGO[m]}
            </label>
          ))}
        </section>
      </div>

      <div className="acciones-formulario">
        <p className="texto-secundario">
          Las reservas existentes conservan el precio y la política con que se hicieron.
        </p>
        <button
          className="acento"
          disabled={
            guardando || p.mediosPago.length === 0 || p.edadMaximaNinoGratis > p.edadMaximaNino
          }
        >
          <Save size={16} /> {guardando ? 'Guardando...' : 'Guardar políticas'}
        </button>
      </div>
    </form>
  );
}
