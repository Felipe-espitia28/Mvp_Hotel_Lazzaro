import type { Desglose, Temporada } from '../api/types';
import { formatearDinero, formatearFecha } from '../formato';

const ETIQUETA_TEMPORADA: Record<Temporada, string> = {
  baja: 'Temporada baja',
  media: 'Temporada media',
  alta: 'Temporada alta',
};

interface Grupo {
  temporada: Temporada;
  motivo: string | null;
  tarifa: number;
  desde: string;
  noches: number;
}

// Agrupa noches consecutivas con la misma temporada y tarifa.
function agrupar(desglose: Desglose): Grupo[] {
  const grupos: Grupo[] = [];
  for (const n of desglose.noches) {
    const ultimo = grupos.at(-1);
    if (ultimo && ultimo.tarifa === n.tarifa && ultimo.motivo === n.motivo) {
      ultimo.noches += 1;
    } else {
      grupos.push({ ...n, desde: n.fecha, noches: 1 });
    }
  }
  return grupos;
}

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
        {agrupar(desglose).map((g) => (
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
        {desglose.personasAdicionales > 0 && (
          <tr>
            <td>
              {desglose.personasAdicionales}{' '}
              {desglose.personasAdicionales === 1 ? 'persona adicional' : 'personas adicionales'} ×{' '}
              {desglose.noches.length} {desglose.noches.length === 1 ? 'noche' : 'noches'}
            </td>
            <td className="monto">{formatearDinero(desglose.cargoPersonaAdicionalPorNoche)}</td>
            <td className="monto">{formatearDinero(desglose.adicionales)}</td>
          </tr>
        )}
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
