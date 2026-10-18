import { useState } from 'react';
import type { NocheOcupacion } from '../logica/ocupacion';

interface Props {
  noches: NocheOcupacion[];
  hoy: string; // YYYY-MM-DD
}

const GUIAS = [50, 100];

const etiquetaDia = (fecha: string) => {
  const d = new Date(fecha);
  return {
    semana: d.toLocaleDateString('es-CO', { weekday: 'short', timeZone: 'UTC' }).replace('.', ''),
    numero: d.getUTCDate(),
    completa: d.toLocaleDateString('es-CO', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    }),
  };
};

// Ocupación de las próximas noches: una sola serie (barras de un tono; hoy en
// dorado y rotulado). Los valores se leen en el tooltip, no sobre cada barra;
// la tabla oculta da el mismo dato a lectores de pantalla.
export function GraficoOcupacion({ noches, hoy }: Props) {
  const [activa, setActiva] = useState<number | null>(null);
  const seleccionada = activa === null ? null : noches[activa];

  return (
    <div className="grafico-ocupacion">
      <div className="grafico-barras" onMouseLeave={() => setActiva(null)}>
        {GUIAS.map((g) => (
          <div key={g} className="grafico-guia" style={{ bottom: `${g}%` }}>
            <span>{g}%</span>
          </div>
        ))}
        {noches.map((n, i) => (
          <div
            key={n.fecha}
            className={`grafico-columna ${n.fecha === hoy ? 'es-hoy' : ''} ${activa === i ? 'activa' : ''}`}
            onMouseEnter={() => setActiva(i)}
            onFocus={() => setActiva(i)}
            onBlur={() => setActiva(null)}
            tabIndex={0}
            aria-label={`${etiquetaDia(n.fecha).completa}: ${n.porcentaje}% de ocupación`}
          >
            <div className="grafico-barra" style={{ height: `${Math.max(n.porcentaje, 1)}%` }} />
          </div>
        ))}
        {seleccionada && activa !== null && (
          <div
            className="grafico-tooltip"
            style={{ left: `${((activa + 0.5) / noches.length) * 100}%` }}
            role="status"
          >
            <strong>{etiquetaDia(seleccionada.fecha).completa}</strong>
            <span>
              {seleccionada.porcentaje}% · {seleccionada.ocupadas} de {seleccionada.total}{' '}
              habitaciones
            </span>
          </div>
        )}
      </div>
      <div className="grafico-ejes" aria-hidden>
        {noches.map((n) => {
          const e = etiquetaDia(n.fecha);
          return (
            <span key={n.fecha} className={n.fecha === hoy ? 'es-hoy' : ''}>
              {n.fecha === hoy ? 'Hoy' : e.semana}
              <br />
              {e.numero}
            </span>
          );
        })}
      </div>

      {/* La clase va en un div: un <table> ignora height/overflow y su contenido
          seguía alargando la página aunque estuviera recortado. */}
      <div className="solo-lectores">
        <table>
          <caption>Ocupación por noche</caption>
          <thead>
            <tr>
              <th>Noche</th>
              <th>Ocupación</th>
            </tr>
          </thead>
          <tbody>
            {noches.map((n) => (
              <tr key={n.fecha}>
                <td>{etiquetaDia(n.fecha).completa}</td>
                <td>
                  {n.porcentaje}% ({n.ocupadas} de {n.total})
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
