import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Link2, MessageCircle, RefreshCw } from 'lucide-react';
import { api } from '../api/client';
import type { EstadoIntentoPago, EstadoPasarela, IntentoPago } from '../api/types';
import { useHotel } from '../contexto/HotelActual';
import { formatearDinero, formatearFechaHora } from '../formato';
import { leerMonto } from '../logica/caja';
import { ETIQUETA_ESTADO_INTENTO, enlaceWhatsApp, textoDelLink } from '../logica/pagosEnLinea';

// Colores de los estados (las mismas etiquetas que las reservas).
const TONO: Record<EstadoIntentoPago, string> = {
  creado: 'confirmada',
  aprobado: 'libre',
  rechazado: 'cerrada',
  expirado: 'cerrada',
};

// B-2: cobrar a distancia. Recepción genera el link, lo copia o lo envía por
// WhatsApp, y ve en qué va. El pago llega al folio solo cuando la pasarela lo
// confirma (R29), no cuando el huésped vuelve a la página.
export function LinkDePago({
  reservaId,
  nombreHuesped,
  puedeGenerar,
  onPagado,
}: {
  reservaId: string;
  nombreHuesped: string;
  puedeGenerar: boolean;
  onPagado: () => void;
}) {
  const { hotel } = useHotel();
  const [estado, setEstado] = useState<EstadoPasarela | null>(null);
  const [intentos, setIntentos] = useState<IntentoPago[]>([]);
  const [montoTexto, setMontoTexto] = useState('');
  const [generando, setGenerando] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pagadosVistos = useRef<number | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [e, lista] = await Promise.all([
        api.pagosEnLinea.estado(),
        api.pagosEnLinea.intentos(reservaId),
      ]);
      setEstado(e);
      setIntentos(lista);
      // Si un intento pasó a pagado desde la última vez, el folio cambió.
      const pagados = lista.filter((i) => i.estado === 'aprobado').length;
      if (pagadosVistos.current !== null && pagados > pagadosVistos.current) onPagado();
      pagadosVistos.current = pagados;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los pagos en línea');
    }
  }, [reservaId, onPagado]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function generar() {
    const monto = montoTexto.trim() === '' ? undefined : leerMonto(montoTexto);
    if (monto === null) {
      setError('Escribe el monto como un número, p. ej. 50.000, o déjalo vacío');
      return;
    }
    setGenerando(true);
    setError(null);
    try {
      const nuevo = await api.pagosEnLinea.crearLink(reservaId, monto);
      setIntentos((antes) => [nuevo, ...antes]);
      setMontoTexto('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar el link');
    } finally {
      setGenerando(false);
    }
  }

  const mensaje = (i: IntentoPago) =>
    textoDelLink({
      nombre: nombreHuesped,
      hotel: hotel?.nombre ?? 'el hotel',
      monto: formatearDinero(i.monto),
      url: i.url,
    });

  async function copiar(i: IntentoPago) {
    try {
      await navigator.clipboard.writeText(mensaje(i));
      setCopiado(i.id);
    } catch {
      setError('No se pudo copiar: selecciona el link y cópialo a mano');
    }
  }

  if (!estado) return error ? <div className="mensaje-error">{error}</div> : null;
  return (
    <div className="link-de-pago">
      {estado.proveedor === 'simulada' && (
        <p className="texto-secundario">Modo de prueba: los links usan la pasarela simulada.</p>
      )}
      {puedeGenerar &&
        (estado.disponible ? (
          <div className="fila-campos">
            <div className="campo">
              <label htmlFor={`link-monto-${reservaId}`}>Monto (opcional)</label>
              <input
                id={`link-monto-${reservaId}`}
                inputMode="decimal"
                placeholder="El anticipo o el saldo"
                value={montoTexto}
                onChange={(e) => setMontoTexto(e.target.value)}
              />
            </div>
            <button className="primario" onClick={generar} disabled={generando}>
              <Link2 size={15} /> {generando ? 'Generando...' : 'Generar link de pago'}
            </button>
          </div>
        ) : (
          <div className="mensaje-aviso">{estado.mensaje}</div>
        ))}
      {error && <div className="mensaje-error">{error}</div>}

      {intentos.length > 0 && (
        <ul className="lista-intentos">
          {intentos.map((i) => (
            <li key={i.id}>
              <div>
                <strong>{formatearDinero(i.monto)}</strong>{' '}
                <span className={`badge-estado ${TONO[i.estado]}`}>
                  {ETIQUETA_ESTADO_INTENTO[i.estado]}
                </span>{' '}
                <span className="texto-secundario">
                  ref. {i.referencia} · {formatearFechaHora(i.creadoEn)}
                  {i.estado === 'creado' && ` · vence ${formatearFechaHora(i.expiraEn)}`}
                </span>
              </div>
              {i.alerta && <div className="mensaje-error">{i.alerta}</div>}
              {i.estado === 'creado' && (
                <div className="acciones-tarjeta">
                  <button className="enlace" onClick={() => copiar(i)}>
                    <Copy size={14} /> {copiado === i.id ? 'Copiado' : 'Copiar'}
                  </button>
                  <a
                    className="enlace"
                    href={enlaceWhatsApp(mensaje(i))}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle size={14} /> Enviar por WhatsApp
                  </a>
                  <a className="enlace" href={i.url} target="_blank" rel="noreferrer">
                    Abrir
                  </a>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {intentos.some((i) => i.estado === 'creado') && (
        <button className="enlace" onClick={cargar}>
          <RefreshCw size={14} /> Actualizar estado
        </button>
      )}
    </div>
  );
}
