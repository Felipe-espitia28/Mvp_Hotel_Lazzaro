import type { ResumenTurno } from '../api/types';
import { ETIQUETA_MEDIO_PAGO, formatearDinero } from '../formato';

// B-3: lo recibido por cada medio de pago en un turno y lo esperado en efectivo.
export function ResumenCaja({ resumen }: { resumen: ResumenTurno }) {
  const conAjustes = resumen.porMedio.some((l) => l.ajustes !== 0);
  return (
    <div className="contenedor-tabla">
      <table className="tabla resumen-caja">
        <thead>
          <tr>
            <th>Medio</th>
            <th>Recibido</th>
            <th>Devuelto</th>
            {conAjustes && <th>Ajustes</th>}
            <th>Neto</th>
          </tr>
        </thead>
        <tbody>
          {resumen.porMedio.length === 0 && (
            <tr>
              <td colSpan={conAjustes ? 5 : 4} className="texto-secundario">
                Sin movimientos en el turno.
              </td>
            </tr>
          )}
          {resumen.porMedio.map((l) => (
            <tr key={l.medio}>
              <td>{ETIQUETA_MEDIO_PAGO[l.medio]}</td>
              <td>{formatearDinero(l.ingresos)}</td>
              <td>{formatearDinero(l.reembolsos)}</td>
              {conAjustes && <td>{formatearDinero(l.ajustes)}</td>}
              <td>
                <strong>{formatearDinero(l.neto)}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        Base {formatearDinero(resumen.baseEfectivo)} + efectivo neto ={' '}
        <strong>esperado en efectivo {formatearDinero(resumen.esperadoEfectivo)}</strong>
      </p>
      {conAjustes && (
        <p className="texto-secundario">
          Los ajustes son anulaciones hechas en este turno de pagos de turnos anteriores.
        </p>
      )}
    </div>
  );
}
