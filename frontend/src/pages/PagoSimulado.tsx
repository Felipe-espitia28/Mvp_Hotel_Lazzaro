import { useEffect, useState } from 'react';
import { CheckCircle2, CreditCard, XCircle } from 'lucide-react';
import { api } from '../api/client';
import type { PagoPublico } from '../api/types';
import { formatearDinero } from '../formato';
import { aplicarTema } from '../logica/tema';

// B-2: la página de pago de la pasarela simulada (solo existe con
// PASARELA_PROVEEDOR=simulada). Los botones no crean el pago: el backend envía
// un evento firmado igual que Wompi a su webhook, y el pago sale de ahí.
export function PagoSimulado({ referencia }: { referencia: string }) {
  const [pago, setPago] = useState<PagoPublico | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    aplicarTema(null);
    api.pagosEnLinea
      .pagoSimulado(referencia)
      .then(setPago)
      .catch(() => setError('Este link de pago no existe o la pasarela simulada no está activa.'));
  }, [referencia]);

  async function decidir(aprobar: boolean) {
    setEnviando(true);
    setError(null);
    try {
      await api.pagosEnLinea.decidirSimulado(referencia, aprobar);
      window.location.assign(`/pago-resultado?referencia=${encodeURIComponent(referencia)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar el pago');
      setEnviando(false);
    }
  }

  return (
    <div className="pagina-publica">
      <div className="franja-prueba" role="note">
        MODO DE PRUEBA · pasarela simulada: no se cobra dinero real
      </div>
      <div className="tarjeta tarjeta-pago">
        <h2>
          <CreditCard size={20} /> Pago en línea
        </h2>
        {pago && (
          <>
            <p className="texto-secundario">{pago.hotel}</p>
            <p className="monto-pago">{formatearDinero(pago.monto)}</p>
            <p className="texto-secundario">Referencia {referencia}</p>
            {pago.estado === 'creado' ? (
              <div className="acciones-modal">
                <button className="secundario" disabled={enviando} onClick={() => decidir(false)}>
                  <XCircle size={16} /> Rechazar
                </button>
                <button className="primario" disabled={enviando} onClick={() => decidir(true)}>
                  <CheckCircle2 size={16} /> Aprobar
                </button>
              </div>
            ) : (
              <div className="mensaje-aviso">Este link de pago ya no está pendiente.</div>
            )}
          </>
        )}
        {error && <div className="mensaje-error">{error}</div>}
      </div>
    </div>
  );
}
