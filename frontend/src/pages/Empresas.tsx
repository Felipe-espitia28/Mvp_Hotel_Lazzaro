import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Building, Pencil, Plus, Search, Wallet } from 'lucide-react';
import { api } from '../api/client';
import type { Empresa, EstadoCuentaEmpresa, MedioPago } from '../api/types';
import { ModalEmpresa } from '../components/ModalEmpresa';
import { useHotel } from '../contexto/HotelActual';
import { ETIQUETA_ESTADO, ETIQUETA_MEDIO_PAGO, formatearDinero, formatearFecha } from '../formato';
import { formatearNit, lineasDelAbono, repartirAbono } from '../logica/empresas';

// B-5: las empresas que pagan reservas: lo que debe cada una (con los
// vencimientos del crédito) y su abono repartido entre varias reservas.
export function Empresas({ puedeEditar }: { puedeEditar: boolean }) {
  const { hotel } = useHotel();
  const mediosPago: MedioPago[] = hotel?.politicas.mediosPago ?? ['transferencia'];
  const [texto, setTexto] = useState('');
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [elegida, setElegida] = useState<string | null>(null);
  const [cuenta, setCuenta] = useState<EstadoCuentaEmpresa | null>(null);
  const [editando, setEditando] = useState<Empresa | 'nueva' | null>(null);
  const [reparto, setReparto] = useState<Record<string, number>>({});
  const [totalAbono, setTotalAbono] = useState('');
  const [medio, setMedio] = useState<MedioPago>(
    mediosPago.includes('transferencia') ? 'transferencia' : mediosPago[0],
  );
  const [referencia, setReferencia] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const buscar = useCallback(async (filtro?: string) => {
    try {
      setEmpresas(await api.empresas.buscar(filtro));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las empresas');
    }
  }, []);

  const cargarCuenta = useCallback(async (id: string) => {
    try {
      setCuenta(await api.empresas.estadoDeCuenta(id));
      setReparto({});
      setTotalAbono('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el estado de cuenta');
    }
  }, []);

  useEffect(() => {
    buscar();
  }, [buscar]);

  useEffect(() => {
    if (elegida) cargarCuenta(elegida);
  }, [elegida, cargarCuenta]);

  const { pagos, total } = lineasDelAbono(reparto);

  async function abonar(evento: FormEvent) {
    evento.preventDefault();
    if (!cuenta) return;
    setError(null);
    setAviso(null);
    try {
      const r = await api.empresas.abonar(cuenta.empresa.id, {
        pagos,
        medio,
        referencia: referencia.trim() || undefined,
      });
      setAviso(`Abono de ${formatearDinero(r.total)} repartido en ${r.pagos} reserva(s)`);
      setReferencia('');
      await cargarCuenta(cuenta.empresa.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar el abono');
    }
  }

  const conSaldo = cuenta?.reservas.filter((r) => r.saldo > 0) ?? [];
  return (
    <div className="pila-gerencia">
      <section className="tarjeta">
        <h3 className="tarjeta-titulo">
          <Building size={18} /> Empresas
        </h3>
        <form
          className="fila-campos"
          onSubmit={(e) => {
            e.preventDefault();
            buscar(texto.trim() || undefined);
          }}
        >
          <div className="campo crece">
            <label htmlFor="empresas-buscar">NIT o nombre</label>
            <input id="empresas-buscar" value={texto} onChange={(e) => setTexto(e.target.value)} />
          </div>
          <button className="secundario">
            <Search size={15} /> Buscar
          </button>
          {puedeEditar && (
            <button type="button" className="primario" onClick={() => setEditando('nueva')}>
              <Plus size={15} /> Nueva empresa
            </button>
          )}
        </form>
        {error && <div className="mensaje-error">{error}</div>}
        {aviso && <div className="mensaje-exito">{aviso}</div>}
        {empresas.length === 0 ? (
          <p className="vacio">No hay empresas registradas.</p>
        ) : (
          <div className="contenedor-tabla">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Razón social</th>
                  <th>NIT</th>
                  <th>Crédito</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {empresas.map((e) => (
                  <tr
                    key={e.id}
                    className={`fila-clic ${elegida === e.id ? 'fila-seleccionada' : ''}`}
                    onClick={() => setElegida(e.id)}
                  >
                    <td>{e.razonSocial}</td>
                    <td>{formatearNit(e.nit, e.digitoVerificacion)}</td>
                    <td>{e.credito ? `${e.diasCredito ?? 0} días` : 'Paga al salir'}</td>
                    <td>
                      {puedeEditar && (
                        <button
                          className="enlace"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setEditando(e);
                          }}
                        >
                          <Pencil size={14} /> Editar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {cuenta && (
        <section className="tarjeta">
          <h3 className="tarjeta-titulo">
            <Wallet size={18} /> Estado de cuenta · {cuenta.empresa.razonSocial}
          </h3>
          <div className="indicadores">
            <div className="indicador">
              <span className="indicador-titulo">Debe</span>
              <span className="indicador-valor">{formatearDinero(cuenta.totales.saldo)}</span>
            </div>
            <div className="indicador">
              <span className="indicador-titulo">Vencido</span>
              <span
                className={`indicador-valor ${cuenta.totales.vencido > 0 ? 'texto-penalidad' : ''}`}
              >
                {formatearDinero(cuenta.totales.vencido)}
              </span>
            </div>
            <div className="indicador">
              <span className="indicador-titulo">Pagado</span>
              <span className="indicador-valor">{formatearDinero(cuenta.totales.pagado)}</span>
            </div>
          </div>

          {cuenta.reservas.length === 0 ? (
            <p className="vacio">Esta empresa todavía no tiene reservas.</p>
          ) : (
            <form onSubmit={abonar}>
              <div className="contenedor-tabla">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Huésped</th>
                      <th>Hab.</th>
                      <th>Estadía</th>
                      <th>Estado</th>
                      <th>Debe</th>
                      <th>Saldo</th>
                      <th>Vence</th>
                      <th>Abonar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cuenta.reservas.map((r) => (
                      <tr key={r.reservaId}>
                        <td>{r.huesped}</td>
                        <td>{r.habitacion}</td>
                        <td>
                          {formatearFecha(r.fechaEntrada)} → {formatearFecha(r.fechaSalida)}
                        </td>
                        <td>{ETIQUETA_ESTADO[r.estado]}</td>
                        <td>{formatearDinero(r.debe)}</td>
                        <td>{formatearDinero(r.saldo)}</td>
                        <td className={r.vencida ? 'texto-penalidad' : undefined}>
                          {r.vencimiento ? formatearFecha(r.vencimiento) : '—'}
                          {r.vencida && ' · vencida'}
                        </td>
                        <td>
                          {r.saldo > 0 && (
                            <input
                              type="number"
                              min={0}
                              max={r.saldo}
                              aria-label={`Abono a la reserva de ${r.huesped}`}
                              className="entrada-tabla"
                              value={reparto[r.reservaId] || ''}
                              onChange={(e) =>
                                setReparto({ ...reparto, [r.reservaId]: Number(e.target.value) })
                              }
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {conSaldo.length > 0 && (
                <div className="fila-campos">
                  <div className="campo">
                    <label htmlFor="abono-total">Repartir un pago de</label>
                    <input
                      id="abono-total"
                      type="number"
                      min={0}
                      value={totalAbono}
                      onChange={(e) => {
                        setTotalAbono(e.target.value);
                        setReparto(repartirAbono(Number(e.target.value), conSaldo));
                      }}
                    />
                  </div>
                  <div className="campo">
                    <label htmlFor="abono-medio">Medio</label>
                    <select
                      id="abono-medio"
                      value={medio}
                      onChange={(e) => setMedio(e.target.value as MedioPago)}
                    >
                      {mediosPago.map((m) => (
                        <option key={m} value={m}>
                          {ETIQUETA_MEDIO_PAGO[m]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="campo">
                    <label htmlFor="abono-referencia">Referencia</label>
                    <input
                      id="abono-referencia"
                      maxLength={60}
                      value={referencia}
                      onChange={(e) => setReferencia(e.target.value)}
                    />
                  </div>
                  <button className="primario" disabled={pagos.length === 0}>
                    Registrar abono de {formatearDinero(total)}
                  </button>
                </div>
              )}
            </form>
          )}
        </section>
      )}

      {editando && (
        <ModalEmpresa
          empresa={editando === 'nueva' ? undefined : editando}
          onCerrar={() => setEditando(null)}
          onGuardada={(e) => {
            setEditando(null);
            setAviso(`Empresa ${e.razonSocial} guardada`);
            buscar(texto.trim() || undefined);
            if (elegida === e.id) cargarCuenta(e.id);
          }}
        />
      )}
    </div>
  );
}
