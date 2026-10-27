import type { Desglose, Temporada } from '../api/types';
import { formatearDinero, formatearFecha } from '../formato';
import { agruparNoches, lineasDeHuespedes } from '../logica/desglose';

const ETIQUETA_TEMPORADA: Record<Temporada, string> = {
  baja: 'Temporada baja',
  media: 'Temporada media',
  alta: 'Temporada alta',
};

interface Props {
  desglose: Desglose;
  // Fuerza la exención de IVA (p. ej. al cotizar antes de saber el documento).
  exentoIva?: boolean;
}

// R17: el total siempre se muestra desglosado, como una cuenta.
export function DesgloseTarifa({ desglose, exentoIva = desglose.iva.exento }: Props) {
  const total = exentoIva ? desglose.subtotal : desglose.total;
  return (
    <table className="desglose">
      <tbody>
        {agruparNoches(desglose).map((g) => (
          <tr key={g.desde}>
            <td>
              {g.noches} {g.noches === 1 ? 'noche' : 'noches'} desde {formatearFecha(g.desde)} ·{' '}
              <span className={`etiqueta-temporada ${g.temporada}`}>
                {ETIQUETA_TEMPORADA[g.temporada]}
              </span>
              {g.motivo && <div className="texto-secundario">{g.motivo}</div>}
            </td>
            <td className="monto">
              {g.noches} × {formatearDinero(g.tarifa)}
            </td>
            <td className="monto">{formatearDinero(g.noches * g.tarifa)}</td>
          </tr>
        ))}
        {lineasDeHuespedes(desglose).map((l) => (
          <tr key={l.concepto}>
            <td>{l.concepto}</td>
            <td className="monto">{l.unitario === null ? '—' : formatearDinero(l.unitario)}</td>
            <td className="monto">{formatearDinero(l.valor)}</td>
          </tr>
        ))}
        <tr className="fila-subtotal">
          <td colSpan={2}>Subtotal</td>
          <td className="monto">{formatearDinero(desglose.subtotal)}</td>
        </tr>
        <tr>
          <td colSpan={2}>
            {exentoIva
              ? 'IVA: exento (huésped extranjero no residente)'
              : `IVA ${desglose.iva.porcentaje} %`}
          </td>
          <td className="monto">{formatearDinero(exentoIva ? 0 : desglose.iva.valor)}</td>
        </tr>
        <tr className="fila-total">
          <td colSpan={2}>Total</td>
          <td className="monto">{formatearDinero(total)}</td>
        </tr>
      </tbody>
    </table>
  );
}
