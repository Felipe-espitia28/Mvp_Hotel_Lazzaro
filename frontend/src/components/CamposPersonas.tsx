import type { ModoPrecio } from '../api/types';
import { leerEdades } from '../logica/servicios';

export interface Personas {
  cantidad: number;
  adultos: number;
  edadesTexto: string;
}

export const PERSONAS_INICIALES: Personas = { cantidad: 1, adultos: 1, edadesTexto: '' };

// Lo que se envía al backend según el modo de precio (R55); null si las
// edades no se pueden leer.
export function quienesDe(modo: ModoPrecio, p: Personas) {
  if (modo !== 'por_edad') return { cantidad: p.cantidad };
  const edadesNinos = leerEdades(p.edadesTexto);
  return edadesNinos ? { adultos: p.adultos, edadesNinos } : null;
}

// Cuántos toman el servicio: cantidad (fijo o por persona) o adultos y edades (por edad).
export function CamposPersonas({
  modo,
  valor,
  onCambio,
}: {
  modo: ModoPrecio;
  valor: Personas;
  onCambio: (p: Personas) => void;
}) {
  if (modo !== 'por_edad') {
    return (
      <div className="campo">
        <label htmlFor="personas-cantidad">
          {modo === 'por_persona' ? 'Personas' : 'Cantidad'}
        </label>
        <input
          id="personas-cantidad"
          type="number"
          min={1}
          value={valor.cantidad}
          onChange={(e) =>
            onCambio({ ...valor, cantidad: Math.max(1, Number(e.target.value) || 1) })
          }
        />
      </div>
    );
  }
  return (
    <div className="fila-campos">
      <div className="campo">
        <label htmlFor="personas-adultos">Adultos</label>
        <input
          id="personas-adultos"
          type="number"
          min={0}
          value={valor.adultos}
          onChange={(e) =>
            onCambio({ ...valor, adultos: Math.max(0, Number(e.target.value) || 0) })
          }
        />
      </div>
      <div className="campo crece">
        <label htmlFor="personas-edades">Edades de los niños</label>
        <input
          id="personas-edades"
          placeholder="p. ej. 3, 8"
          value={valor.edadesTexto}
          aria-invalid={leerEdades(valor.edadesTexto) === null}
          onChange={(e) => onCambio({ ...valor, edadesTexto: e.target.value })}
        />
      </div>
    </div>
  );
}
