import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Printer, Wallet } from 'lucide-react';
import { api } from '../../api/client';
import type { PagoSinTurno, Turno, Usuario } from '../../api/types';
import { useHotel } from '../../contexto/HotelActual';
import { ETIQUETA_MEDIO_PAGO, formatearDinero, formatearFechaHora } from '../../formato';
import { sumarDias } from '../../logica/calendario';
import { ResumenCaja } from '../../components/ResumenCaja';

const hoyLocal = () => new Date().toLocaleDateString('en-CA');

// De quién es un pago sin turno, en una línea.
const deQuien = (p: PagoSinTurno) =>
  p.reserva?.huesped.nombre ?? p.cita?.huesped.nombre ?? p.cupo?.huesped.nombre ?? '—';

// B-3: historial de los turnos de caja del hotel (todos los usuarios), el
// aviso de lo que se hizo sin turno y la hoja de cierre para imprimir.
export function Caja() {
  const { hotel } = useHotel();
  const [desde, setDesde] = useState(() => sumarDias(hoyLocal(), -30));
  const [hasta, setHasta] = useState(hoyLocal);
  const [usuarioId, setUsuarioId] = useState('');
  const [equipo, setEquipo] = useState<Usuario[]>([]);
  const [turnos, setTurnos] = useState<Turno[] | null>(null);
  const [sinTurno, setSinTurno] = useState<{ pagos: PagoSinTurno[]; anulaciones: PagoSinTurno[] }>({
    pagos: [],
    anulaciones: [],
  });
  const [abierto, setAbierto] = useState<string | null>(null);
  const [imprimiendo, setImprimiendo] = useState<Turno | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [t, s] = await Promise.all([
        api.turnos.listar({ desde, hasta, usuarioId: usuarioId || undefined }),
        api.turnos.sinTurno(),
      ]);
      setTurnos(t);
      setSinTurno(s);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar los turnos');
    }
  }, [desde, hasta, usuarioId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    api.equipo
      .listar()
      .then(setEquipo)
      .catch(() => setEquipo([]));
  }, []);

  // Se dibuja la hoja y, ya en pantalla, se abre el diálogo de impresión.
  useEffect(() => {
    if (!imprimiendo) return;
    const despues = () => setImprimiendo(null);
    window.addEventListener('afterprint', despues);
    window.print();
    return () => window.removeEventListener('afterprint', despues);
  }, [imprimiendo]);

  const avisos = sinTurno.pagos.length + sinTurno.anulaciones.length;
  return (
    <section className="tarjeta">
      <h3 className="tarjeta-titulo">
        <Wallet size={18} /> Turnos de caja
      </h3>
      {error && <div className="mensaje-error">{error}</div>}

      {avisos > 0 && (
        <div className="aviso-caja">
          <h4>
            <AlertTriangle size={16} /> {avisos} {avisos === 1 ? 'movimiento' : 'movimientos'} sin
            turno abierto
          </h4>
          <ul>
            {sinTurno.pagos.map((p) => (
              <li key={`p-${p.id}`}>
                {formatearFechaHora(p.fecha)} · {p.tipo} {ETIQUETA_MEDIO_PAGO[p.medio]}{' '}
                {formatearDinero(p.monto)} · {deQuien(p)} · registró {p.usuario?.nombre ?? '—'}
              </li>
            ))}
            {sinTurno.anulaciones.map((p) => (
              <li key={`a-${p.id}`}>
                {p.anuladoEn && formatearFechaHora(p.anuladoEn)} · anulación de {p.tipo}{' '}
                {ETIQUETA_MEDIO_PAGO[p.medio]} {formatearDinero(p.monto)} · {deQuien(p)} · anuló{' '}
                {p.anuladoPor?.nombre ?? '—'}
              </li>
            ))}
          </ul>
          <p className="texto-secundario">
            Se registraron sin un turno abierto, así que no están en ningún cierre: revisa con quien
            los hizo.
          </p>
        </div>
      )}

      <div className="fila-campos">
        <div className="campo">
          <label htmlFor="caja-desde">Desde</label>
          <input
            id="caja-desde"
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
          />
        </div>
        <div className="campo">
          <label htmlFor="caja-hasta">Hasta</label>
          <input
            id="caja-hasta"
            type="date"
            value={hasta}
            min={desde}
            onChange={(e) => setHasta(e.target.value)}
          />
        </div>
        <div className="campo">
          <label htmlFor="caja-usuario">Usuario</label>
          <select
            id="caja-usuario"
            value={usuarioId}
            onChange={(e) => setUsuarioId(e.target.value)}
          >
            <option value="">Todos</option>
            {equipo.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      {turnos &&
        (turnos.length === 0 ? (
          <p className="vacio">No hay turnos en esas fechas.</p>
        ) : (
          <div className="contenedor-tabla">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Turno</th>
                  <th>Esperado en efectivo</th>
                  <th>Contado</th>
                  <th>Diferencia</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {turnos.map((t) => {
                  const diferencia = t.resumen.diferencia;
                  return (
                    <tr key={t.id}>
                      <td>{t.usuario.nombre}</td>
                      <td>
                        {formatearFechaHora(t.abiertoEn)} →{' '}
                        {t.cerradoEn ? formatearFechaHora(t.cerradoEn) : <em>abierto</em>}
                      </td>
                      <td>{formatearDinero(t.resumen.esperadoEfectivo)}</td>
                      <td>{t.efectivoContado ? formatearDinero(t.efectivoContado) : '—'}</td>
                      <td>
                        {diferencia === undefined ? (
                          '—'
                        ) : (
                          <span
                            className={`diferencia-caja ${diferencia === 0 ? 'cuadra' : 'descuadre'}`}
                          >
                            {formatearDinero(diferencia)}
                          </span>
                        )}
                      </td>
                      <td>
                        <button
                          className="enlace"
                          onClick={() => setAbierto(abierto === t.id ? null : t.id)}
                        >
                          {abierto === t.id ? 'Ocultar' : 'Ver'}
                        </button>{' '}
                        {t.cerradoEn && (
                          <button className="enlace" onClick={() => setImprimiendo(t)}>
                            <Printer size={14} /> Imprimir
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}

      {abierto && turnos?.find((t) => t.id === abierto) && (
        <div className="detalle-turno">
          <ResumenCaja resumen={turnos.find((t) => t.id === abierto)!.resumen} />
          {turnos.find((t) => t.id === abierto)!.observaciones && (
            <p>Observaciones: {turnos.find((t) => t.id === abierto)!.observaciones}</p>
          )}
        </div>
      )}

      {imprimiendo && (
        <div className="hoja-impresion">
          <h2>{hotel?.nombre ?? 'Hotel'} · Cierre de caja</h2>
          <p>
            {imprimiendo.usuario.nombre} · {formatearFechaHora(imprimiendo.abiertoEn)} →{' '}
            {imprimiendo.cerradoEn && formatearFechaHora(imprimiendo.cerradoEn)}
          </p>
          <ResumenCaja resumen={imprimiendo.resumen} />
          <p>
            Contado: <strong>{formatearDinero(imprimiendo.resumen.efectivoContado ?? 0)}</strong> ·
            Diferencia: <strong>{formatearDinero(imprimiendo.resumen.diferencia ?? 0)}</strong>
          </p>
          {imprimiendo.observaciones && <p>Observaciones: {imprimiendo.observaciones}</p>}
          <p className="firmas">Entrega: ____________________ Recibe: ____________________</p>
        </div>
      )}
    </section>
  );
}
