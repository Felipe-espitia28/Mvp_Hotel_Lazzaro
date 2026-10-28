import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api/client';
import type {
  CategoriaCargo,
  CategoriaServicio,
  Folio,
  MedioPago,
  Responsable,
  Servicio,
} from '../api/types';
import { useHotel } from '../contexto/HotelActual';
import {
  ETIQUETA_CATEGORIA,
  ETIQUETA_MEDIO_PAGO,
  ETIQUETA_TIPO_PAGO,
  formatearDinero,
  formatearFechaHora,
} from '../formato';
import { estadoSaldo } from '../logica/pagos';
import { leerEdades, precioEstimado } from '../logica/servicios';

interface Props {
  reservaId: string;
  // Recepción y admin cargan consumos (solo con la estadía activa, R21) y registran abonos.
  puedeCargar: boolean;
  // A-1: anular un pago es una corrección contable: solo el admin.
  puedeAnularPagos: boolean;
  // Avisa que el folio cambió (p. ej. para refrescar el historial).
  onCambio?: () => void;
}

const TEXTO_SALDO = {
  debe: 'Saldo pendiente',
  saldado: 'Cuenta saldada',
  'a-favor': 'Saldo a favor del huésped',
} as const;

// Folio (R20–R23, A-1): consumos y pagos de la estadía, con el saldo arriba.
export function FolioReserva({ reservaId, puedeCargar, puedeAnularPagos, onCambio }: Props) {
  const [folio, setFolio] = useState<Folio | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Catálogo del hotel ('' = consumo con valor libre), agrupado por sus categorías.
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [categorias, setCategorias] = useState<CategoriaServicio[]>([]);
  const [servicioId, setServicioId] = useState('');
  // R55: quiénes toman un servicio por edad (precargados con los de la reserva).
  const [adultos, setAdultos] = useState(1);
  const [edadesNinos, setEdadesNinos] = useState('');
  const [categoria, setCategoria] = useState<CategoriaCargo>('restaurante');
  const [concepto, setConcepto] = useState('');
  const [cantidad, setCantidad] = useState(1);
  const [valorUnitario, setValorUnitario] = useState('');
  const [enviando, setEnviando] = useState(false);
  // Abono o reembolso: solo los medios que el hotel recibe.
  const { hotel } = useHotel();
  const mediosPago: MedioPago[] = hotel?.politicas.mediosPago ?? ['efectivo'];
  const [medio, setMedio] = useState<MedioPago>(mediosPago[0]);
  const [montoPago, setMontoPago] = useState('');
  const [referencia, setReferencia] = useState('');
  // B-5: a qué subcuenta abona el pago (si la reserva tiene empresa).
  const [responsablePago, setResponsablePago] = useState<Responsable>('huesped');

  useEffect(() => {
    api
      .folio(reservaId)
      .then(setFolio)
      .catch((e) => setError(e instanceof Error ? e.message : 'Error al cargar el folio'));
  }, [reservaId]);

  const abiertoParaCargar = folio?.estado === 'activa' && puedeCargar;
  useEffect(() => {
    if (!abiertoParaCargar) return;
    // Recepción recibe solo lo que se ofrece; el admin, todo: aquí solo los activos.
    Promise.all([api.servicios({ activo: true }), api.categoriasServicio()])
      .then(([lista, cats]) => {
        const activas = cats.filter((c) => c.activa);
        setServicios(lista);
        setCategorias(activas);
        // Queda elegido el primero del catálogo, en el orden de las categorías.
        const primero = activas.flatMap((c) => lista.filter((s) => s.categoria.id === c.id))[0];
        setServicioId((actual) => actual || primero?.id || '');
      })
      .catch(() => setServicios([])); // Sin catálogo se cargan con valor libre.
  }, [abiertoParaCargar]);

  const servicio = servicios.find((s) => s.id === servicioId);
  const edades = leerEdades(edadesNinos);
  const rangos = {
    gratisHasta: hotel?.politicas.edadMaximaNinoGratis ?? 4,
    ninoHasta: hotel?.politicas.edadMaximaNino ?? 11,
  };

  // Al elegir un servicio por persona o por edad se precargan los ocupantes.
  function elegirServicio(id: string) {
    setServicioId(id);
    const elegido = servicios.find((s) => s.id === id);
    if (!folio || !elegido) return;
    const { huespedes } = folio;
    if (elegido.modoPrecio === 'por_persona') {
      setCantidad(huespedes.adultos + huespedes.edadesNinos.length);
    } else if (elegido.modoPrecio === 'por_edad') {
      setAdultos(huespedes.adultos);
      setEdadesNinos(huespedes.edadesNinos.join(', '));
    } else {
      setCantidad(1);
    }
  }

  async function actualizar(accion: () => Promise<Folio>, mensaje: string) {
    setError(null);
    try {
      setFolio(await accion());
      onCambio?.();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : mensaje);
      return false;
    }
  }

  async function cargar(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    const hecho = await actualizar(
      () =>
        api.agregarCargo(
          reservaId,
          servicio
            ? servicio.modoPrecio === 'por_edad'
              ? { servicioId: servicio.id, adultos, edadesNinos: edades ?? [] }
              : { servicioId: servicio.id, cantidad }
            : { categoria, concepto, cantidad, valorUnitario: Number(valorUnitario) },
        ),
      'No se pudo cargar el consumo',
    );
    if (hecho) {
      setConcepto('');
      setCantidad(1);
      setValorUnitario('');
    }
    setEnviando(false);
  }

  async function pagar(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    const hecho = await actualizar(
      () =>
        api.registrarPago(reservaId, {
          tipo: tipoDePago,
          medio,
          monto: Number(montoPago),
          referencia: referencia.trim() || undefined,
          responsable: folio?.empresa ? responsablePago : undefined,
        }),
      'No se pudo registrar el pago',
    );
    if (hecho) {
      setMontoPago('');
      setReferencia('');
    }
    setEnviando(false);
  }

  async function anularCargo(cargoId: string, nombre: string) {
    const motivo = window.prompt(`¿Por qué se anula "${nombre}"? (queda en la auditoría)`);
    if (motivo) {
      await actualizar(
        () => api.anularCargo(reservaId, cargoId, motivo),
        'No se pudo anular el cargo',
      );
    }
  }

  async function moverCargo(cargoId: string, a: Responsable) {
    await actualizar(() => api.moverCargo(reservaId, cargoId, a), 'No se pudo mover el cargo');
  }

  async function anularPago(pagoId: string, nombre: string) {
    const motivo = window.prompt(`¿Por qué se anula el ${nombre}? (queda en la auditoría)`);
    if (motivo) {
      await actualizar(
        () => api.anularPago(reservaId, pagoId, motivo),
        'No se pudo anular el pago',
      );
    }
  }

  if (!folio)
    return error ? <div className="mensaje-error">{error}</div> : <p>Cargando folio...</p>;

  const abierto = folio.estado === 'activa';
  const estado = estadoSaldo(folio.saldo);
  // A-2: antes de llegar se paga un anticipo; con la estadía activa, abonos;
  // después del cierre, solo lo que quedó pendiente, o se reembolsa un saldo a favor.
  const confirmada = folio.estado === 'confirmada';
  const puedePagar = puedeCargar && (abierto || confirmada || estado !== 'saldado');
  // B-5: con empresa, el tipo se decide por el saldo de la subcuenta elegida.
  const saldoDelPago = folio.empresa ? folio.subcuentas[responsablePago].saldo : folio.saldo;
  const tipoDePago = saldoDelPago < 0 ? 'reembolso' : confirmada ? 'anticipo' : 'abono';
  const nombreEmpresa = folio.empresa?.razonSocial ?? 'Empresa';
  return (
    <div>
      {error && <div className="mensaje-error">{error}</div>}

      <div className={`saldo-folio ${estado}`} aria-live="polite">
        <span>{TEXTO_SALDO[estado]}</span>
        <strong>{formatearDinero(Math.abs(folio.saldo))}</strong>
        <span className="texto-secundario">
          {abierto ? 'Total en curso' : 'Total liquidado'} {formatearDinero(folio.total)} · pagado{' '}
          {formatearDinero(folio.pagado - folio.reembolsado)}
        </span>
      </div>

      {/* B-5: un folio, dos subcuentas: lo del huésped y lo de la empresa. */}
      {folio.empresa && (
        <div className="subcuentas-folio">
          {(['huesped', 'empresa'] as const).map((r) => {
            const cuenta = folio.subcuentas[r];
            return (
              <div key={r} className={`subcuenta ${estadoSaldo(cuenta.saldo)}`}>
                <span className="texto-secundario">
                  {r === 'huesped' ? 'Huésped' : nombreEmpresa}
                  {r === 'empresa' &&
                    ` · ${folio.reglaEmpresa === 'todo' ? 'paga todo' : 'paga el alojamiento'}${
                      folio.empresa?.credito ? ' · a crédito' : ''
                    }`}
                </span>
                <strong>{formatearDinero(Math.abs(cuenta.saldo))}</strong>
                <span className="texto-secundario">
                  {cuenta.saldo < 0 ? 'a favor' : cuenta.saldo === 0 ? 'saldada' : 'pendiente'} ·
                  cargos {formatearDinero(cuenta.debe)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {confirmada && Number(folio.anticipoSugerido) > 0 && (
        <p className="texto-secundario">
          Anticipo sugerido al reservar: <strong>{formatearDinero(folio.anticipoSugerido!)}</strong>
          .
        </p>
      )}

      {folio.movimientos.length === 0 ? (
        <p className="texto-secundario">Sin consumos ni pagos registrados.</p>
      ) : (
        <table className="desglose">
          <tbody>
            {folio.movimientos.map((m) =>
              m.clase === 'cargo' ? (
                <tr key={m.registro.id} className={m.registro.anulado ? 'cargo-anulado' : ''}>
                  <td>
                    {m.registro.concepto} × {m.registro.cantidad}
                    <div className="texto-secundario">
                      {ETIQUETA_CATEGORIA[m.registro.categoria]} · {formatearFechaHora(m.fecha)} ·{' '}
                      {m.registro.usuario.nombre}
                      {m.registro.anulado && ` · Anulado: ${m.registro.motivoAnulacion}`}
                      {folio.empresa &&
                        m.registro.responsable === 'empresa' &&
                        ` · ${nombreEmpresa}`}
                    </div>
                  </td>
                  <td className="monto">{formatearDinero(m.registro.total)}</td>
                  <td>
                    {abierto && puedeCargar && !m.registro.anulado && (
                      <>
                        {folio.empresa && (
                          <button
                            className="enlace"
                            onClick={() =>
                              moverCargo(
                                m.registro.id,
                                m.registro.responsable === 'empresa' ? 'huesped' : 'empresa',
                              )
                            }
                          >
                            {m.registro.responsable === 'empresa'
                              ? 'Mover al huésped'
                              : 'Mover a la empresa'}
                          </button>
                        )}{' '}
                        <button
                          className="enlace"
                          onClick={() => anularCargo(m.registro.id, m.registro.concepto)}
                        >
                          Anular
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ) : (
                <tr
                  key={m.registro.id}
                  className={`fila-pago ${m.registro.anulado ? 'cargo-anulado' : ''}`}
                >
                  <td>
                    {ETIQUETA_TIPO_PAGO[m.registro.tipo]} · {ETIQUETA_MEDIO_PAGO[m.registro.medio]}
                    {m.registro.referencia && ` · ref. ${m.registro.referencia}`}
                    {m.registro.responsable === 'empresa' && ` · ${nombreEmpresa}`}
                    <div className="texto-secundario">
                      {formatearFechaHora(m.fecha)} · {m.registro.usuario?.nombre ?? 'Sistema'}
                      {m.registro.anulado &&
                        ` · Anulado por ${m.registro.anuladoPor?.nombre ?? '—'}: ${m.registro.motivoAnulacion}`}
                    </div>
                  </td>
                  <td className="monto">
                    {m.registro.tipo === 'reembolso' ? '+' : '−'}
                    {formatearDinero(m.registro.monto)}
                  </td>
                  <td>
                    {puedeAnularPagos && !m.registro.anulado && (
                      <button
                        className="enlace"
                        onClick={() =>
                          anularPago(
                            m.registro.id,
                            ETIQUETA_TIPO_PAGO[m.registro.tipo].toLowerCase(),
                          )
                        }
                      >
                        Anular
                      </button>
                    )}
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      )}

      <table className="desglose">
        <tbody>
          <tr>
            <td>Alojamiento pactado</td>
            <td className="monto">{formatearDinero(folio.alojamiento)}</td>
          </tr>
          <tr>
            <td>Consumos</td>
            <td className="monto">{formatearDinero(folio.consumos)}</td>
          </tr>
          <tr className="fila-total">
            <td>{abierto ? 'Total en curso' : 'Total liquidado'}</td>
            <td className="monto">{formatearDinero(folio.total)}</td>
          </tr>
        </tbody>
      </table>

      {puedePagar && (
        <form className="form-cargo" onSubmit={pagar}>
          {folio.empresa && (
            <select
              aria-label="Quién paga"
              value={responsablePago}
              onChange={(e) => setResponsablePago(e.target.value as Responsable)}
            >
              <option value="huesped">Paga el huésped</option>
              <option value="empresa">Paga {nombreEmpresa}</option>
            </select>
          )}
          <select
            aria-label="Medio de pago"
            value={medio}
            onChange={(e) => setMedio(e.target.value as MedioPago)}
          >
            {mediosPago.map((m) => (
              <option key={m} value={m}>
                {ETIQUETA_MEDIO_PAGO[m]}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            aria-label="Monto"
            placeholder="Monto"
            value={montoPago}
            onChange={(e) => setMontoPago(e.target.value)}
            required
          />
          <input
            aria-label="Referencia"
            placeholder="Referencia (opcional)"
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            maxLength={60}
          />
          <button className="secundario" disabled={enviando || !(Number(montoPago) > 0)}>
            {tipoDePago === 'reembolso'
              ? 'Registrar reembolso'
              : tipoDePago === 'anticipo'
                ? 'Registrar anticipo'
                : 'Registrar abono'}
          </button>
        </form>
      )}

      {abierto && puedeCargar && (
        <form className="form-cargo" onSubmit={cargar}>
          <select
            aria-label="Consumo"
            value={servicioId}
            onChange={(e) => elegirServicio(e.target.value)}
          >
            {categorias.map((cat) => {
              const delGrupo = servicios.filter((s) => s.categoria.id === cat.id);
              return delGrupo.length === 0 ? null : (
                <optgroup key={cat.id} label={cat.nombre}>
                  {delGrupo.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre} · {formatearDinero(s.precio)}
                      {s.modoPrecio === 'por_persona' && ' c/u'}
                      {s.modoPrecio === 'por_edad' && ' adulto'}
                    </option>
                  ))}
                </optgroup>
              );
            })}
            <option value="">Otro consumo (valor libre)</option>
          </select>
          {!servicio && (
            <>
              <select
                aria-label="Categoría"
                value={categoria}
                onChange={(e) => setCategoria(e.target.value as CategoriaCargo)}
              >
                {Object.entries(ETIQUETA_CATEGORIA).map(([valor, etiqueta]) => (
                  <option key={valor} value={valor}>
                    {etiqueta}
                  </option>
                ))}
              </select>
              <input
                placeholder="Concepto"
                value={concepto}
                onChange={(e) => setConcepto(e.target.value)}
                required
              />
            </>
          )}
          {servicio?.modoPrecio === 'por_edad' ? (
            <>
              <input
                type="number"
                min={0}
                max={30}
                aria-label="Adultos"
                title="Adultos"
                value={adultos}
                onChange={(e) => setAdultos(Math.max(0, Number(e.target.value) || 0))}
              />
              <input
                aria-label="Edades de los niños"
                placeholder="Edades de los niños (3, 8)"
                value={edadesNinos}
                aria-invalid={edades === null}
                onChange={(e) => setEdadesNinos(e.target.value)}
              />
            </>
          ) : (
            <input
              type="number"
              min={1}
              aria-label={servicio?.modoPrecio === 'por_persona' ? 'Personas' : 'Cantidad'}
              title={servicio?.modoPrecio === 'por_persona' ? 'Personas' : 'Cantidad'}
              value={cantidad}
              onChange={(e) => setCantidad(Math.max(1, Number(e.target.value) || 1))}
            />
          )}
          {!servicio && (
            <input
              type="number"
              min={1}
              placeholder="Valor unitario"
              value={valorUnitario}
              onChange={(e) => setValorUnitario(e.target.value)}
              required
            />
          )}
          <button
            className="primario"
            disabled={enviando || (servicio?.modoPrecio === 'por_edad' && edades === null)}
          >
            {enviando
              ? 'Cargando...'
              : servicio
                ? `Cargar ${formatearDinero(
                    precioEstimado(
                      servicio,
                      { cantidad, adultos, edadesNinos: edades ?? [] },
                      rangos,
                    ),
                  )}`
                : 'Cargar a la habitación'}
          </button>
        </form>
      )}
    </div>
  );
}
