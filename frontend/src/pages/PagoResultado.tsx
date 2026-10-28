import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { api } from '../api/client';
import type { PagoPublico } from '../api/types';
import { formatearDinero } from '../formato';
import { aplicarTema } from '../logica/tema';

const CADA_MS = 4000;
const MAXIMO_CONSULTAS = 45; // unos 3 minutos

// B-2: a donde vuelve el huésped después de pagar. Solo muestra lo que el
// backend sabe: el pago existe cuando llega el evento de la pasarela (R29),
// no por haber vuelto a esta página.
export function PagoResultado({ referencia }: { referencia: string }) {
  const [pago, setPago] = useState<PagoPublico | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    aplicarTema(null);
    let consultas = 0;
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    const consultar = async () => {
      try {
        const actual = await api.pagosEnLinea.estadoPublico(referencia);
        setPago(actual);
        if (actual.estado === 'creado' && ++consultas < MAXIMO_CONSULTAS) {
          temporizador = setTimeout(consultar, CADA_MS);
        }
      } catch {
        setError('No encontramos este pago.');
      }
    };
    consultar();
    return () => clearTimeout(temporizador);
  }, [referencia]);

  return (
    <div className="pagina-publica">
      <div className="tarjeta tarjeta-pago">
        {error && <div className="mensaje-error">{error}</div>}
        {pago?.estado === 'creado' && (
          <>
            <h2>
              <Clock size={20} /> Estamos confirmando tu pago
            </h2>
            <p className="texto-secundario">
              En cuanto la pasarela nos confirme el pago de {formatearDinero(pago.monto)}, quedará
              registrado en tu reserva en {pago.hotel}. Puedes cerrar esta página.
            </p>
          </>
        )}
        {pago?.estado === 'aprobado' && (
          <>
            <h2>
              <CheckCircle2 size={20} /> Pago recibido
            </h2>
            <p>
              {pago.hotel} recibió tu pago de {formatearDinero(pago.monto)}. ¡Gracias!
            </p>
          </>
        )}
        {(pago?.estado === 'rechazado' || pago?.estado === 'expirado') && (
          <>
            <h2>
              <XCircle size={20} />{' '}
              {pago.estado === 'rechazado' ? 'El pago no se aprobó' : 'Este link venció'}
            </h2>
            <p className="texto-secundario">
              No se hizo ningún cobro. Escríbele a {pago.hotel} para recibir un link nuevo.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
