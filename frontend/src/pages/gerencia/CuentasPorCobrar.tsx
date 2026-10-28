import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { CuentaPorCobrar, MedioPago } from '../../api/types';
import { useHotel } from '../../contexto/HotelActual';
import {
  ETIQUETA_ESTADO,
  ETIQUETA_MEDIO_PAGO,
  ETIQUETA_TIPO_DOCUMENTO,
  formatearDinero,
  formatearFecha,
} from '../../formato';
import { agruparPorPagador } from '../../logica/empresas';

// Quién debe: el huésped o la empresa que paga su reserva (B-5).
const deudor = (c: CuentaPorCobrar) => c.empresa?.razonSocial ?? c.huesped.nombre;

// A-1: lo que los huéspedes aún deben al hotel (estadías cerradas con saldo
// pendiente y penalidades sin pagar), que se abona desde aquí. A-2: y lo que
// el hotel debe devolver (anticipos de cancelaciones, excedentes de no-shows).
export function CuentasPorCobrar() {
  const [cuentas, setCuentas] = useState<CuentaPorCobrar[] | null>(null);
  const [aFavor, setAFavor] = useState<CuentaPorCobrar[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const { hotel } = useHotel();
  const mediosPago: MedioPago[] = hotel?.politicas.mediosPago ?? ['efectivo'];
  const [medio, setMedio] = useState<MedioPago>(mediosPago[0]);

  const cargar = useCallback(async () => {
    try {
      const [porCobrar, saldos] = await Promise.all([api.cuentasPorCobrar(), api.saldosAFavor()]);
      setCuentas(porCobrar);
      setAFavor(saldos);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar las cuentas por cobrar');
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function abonar(c: CuentaPorCobrar) {
    const texto = window.prompt(
      `¿Cuánto abona ${deudor(c)}? (${ETIQUETA_MEDIO_PAGO[medio]}; saldo ${formatearDinero(c.saldo)})`,
      String(c.saldo),
    );
    const monto = Number(texto);
    if (!texto || !(monto > 0)) return;
    setError(null);
    setAviso(null);
    try {
      await api.registrarPago(c.reservaId, { medio, monto, responsable: c.responsable });
      setAviso(`Abono de ${formatearDinero(monto)} registrado para ${deudor(c)}.`);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar el abono');
    }
  }

  async function reembolsar(c: CuentaPorCobrar) {
    const monto = -c.saldo;
    if (
      !window.confirm(
        `¿Registrar el reembolso de ${formatearDinero(monto)} a ${deudor(c)} por ${ETIQUETA_MEDIO_PAGO[medio]}?`,
      )
    ) {
      return;
    }
    setError(null);
    setAviso(null);
    try {
      await api.registrarPago(c.reservaId, {
        tipo: 'reembolso',
        medio,
        monto,
        responsable: c.responsable,
      });
      setAviso(`Reembolso de ${formatearDinero(monto)} registrado para ${deudor(c)}.`);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar el reembolso');
    }
  }

  const total = cuentas?.reduce((s, c) => s + c.saldo, 0) ?? 0;
  return (
    <section className="tarjeta">
      <div className="barra-titulo">
        <h3 className="tarjeta-titulo">Cuentas por cobrar</h3>
        <select
          aria-label="Medio de los abonos"
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
      {error && <div className="mensaje-error">{error}</div>}
      {aviso && <div className="mensaje-exito">{aviso}</div>}
      {cuentas &&
        (cuentas.length === 0 ? (
          <p className="vacio">No hay cuentas pendientes: todo está cobrado.</p>
        ) : (
          <>
            <p className="texto-secundario">
              {cuentas.length} {cuentas.length === 1 ? 'cuenta' : 'cuentas'} por{' '}
              {formatearDinero(total)}.
            </p>
            {agruparPorPagador(cuentas).map((grupo) => (
              <div className="contenedor-tabla" key={grupo.empresaId ?? 'huespedes'}>
                <h4>
                  {grupo.titulo} · {formatearDinero(grupo.total)}
                </h4>
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Huésped</th>
                      <th>Estadía</th>
                      <th>Estado</th>
                      <th>Pagado</th>
                      <th>Saldo</th>
                      {grupo.empresaId && <th>Vence</th>}
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {grupo.cuentas.map((c) => (
                      <tr key={`${c.reservaId}-${c.responsable}`}>
                        <td>
                          {c.huesped.nombre}
                          <div className="texto-secundario">
                            {ETIQUETA_TIPO_DOCUMENTO[c.huesped.tipoDocumento]} {c.huesped.documento}
                          </div>
                        </td>
                        <td>
                          Hab. {c.habitacion} · {formatearFecha(c.fechaEntrada)} →{' '}
                          {formatearFecha(c.fechaSalida)}
                        </td>
                        <td>
                          <span className={`badge-estado ${c.estado}`}>
                            {ETIQUETA_ESTADO[c.estado]}
                          </span>
                        </td>
                        <td>
                          {formatearDinero(c.pagado)} de {formatearDinero(c.debe)}
                        </td>
                        <td>
                          <strong>{formatearDinero(c.saldo)}</strong>
                        </td>
                        {grupo.empresaId && (
                          <td>{c.vencimiento ? formatearFecha(c.vencimiento) : '—'}</td>
                        )}
                        <td>
                          <button className="enlace" onClick={() => abonar(c)}>
                            Registrar abono
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </>
        ))}

      {aFavor.length > 0 && (
        <>
          <h4>Saldos a favor de los huéspedes</h4>
          <div className="contenedor-tabla">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Huésped</th>
                  <th>Estadía</th>
                  <th>Estado</th>
                  <th>A devolver</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {aFavor.map((c) => (
                  <tr key={`${c.reservaId}-${c.responsable}`}>
                    <td>
                      {deudor(c)}
                      <div className="texto-secundario">
                        {ETIQUETA_TIPO_DOCUMENTO[c.huesped.tipoDocumento]} {c.huesped.documento}
                      </div>
                    </td>
                    <td>
                      Hab. {c.habitacion} · {formatearFecha(c.fechaEntrada)} →{' '}
                      {formatearFecha(c.fechaSalida)}
                    </td>
                    <td>
                      <span className={`badge-estado ${c.estado}`}>
                        {ETIQUETA_ESTADO[c.estado]}
                      </span>
                    </td>
                    <td>
                      <strong>{formatearDinero(-c.saldo)}</strong>
                    </td>
                    <td>
                      <button className="enlace" onClick={() => reembolsar(c)}>
                        Registrar reembolso
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
