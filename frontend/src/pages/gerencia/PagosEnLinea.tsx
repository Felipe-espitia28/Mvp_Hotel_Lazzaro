import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Copy, CreditCard, PlugZap } from 'lucide-react';
import { api } from '../../api/client';
import type { EstadoPasarela, LlavesWompi } from '../../api/types';
import { formatearFechaHora } from '../../formato';

const VACIAS: LlavesWompi = {
  llavePublica: '',
  llavePrivada: '',
  secretoEventos: '',
  secretoIntegridad: '',
};

const CAMPOS: { campo: keyof LlavesWompi; etiqueta: string; ejemplo: string }[] = [
  { campo: 'llavePublica', etiqueta: 'Llave pública', ejemplo: 'pub_test_…' },
  { campo: 'llavePrivada', etiqueta: 'Llave privada', ejemplo: 'prv_test_…' },
  { campo: 'secretoEventos', etiqueta: 'Secreto de eventos', ejemplo: 'test_events_…' },
  { campo: 'secretoIntegridad', etiqueta: 'Secreto de integridad', ejemplo: 'test_integrity_…' },
];

// B-2: conectar la cuenta de Wompi del hotel. Las llaves se guardan cifradas y
// nunca se vuelven a mostrar: el formulario siempre empieza vacío.
export function PagosEnLinea() {
  const [estado, setEstado] = useState<EstadoPasarela | null>(null);
  const [llaves, setLlaves] = useState<LlavesWompi>(VACIAS);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);

  const cargar = useCallback(async () => {
    try {
      setEstado(await api.pagosEnLinea.estado());
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof Error ? e.message : 'Error al cargar' });
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    setMensaje(null);
    try {
      setEstado(await api.pagosEnLinea.guardarLlaves(llaves));
      setLlaves(VACIAS);
      setMensaje({ tipo: 'exito', texto: 'Llaves guardadas. Prueba la conexión.' });
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se guardaron' });
    } finally {
      setGuardando(false);
    }
  }

  async function probar() {
    setMensaje(null);
    try {
      const { ok, mensaje: texto } = await api.pagosEnLinea.probar();
      setMensaje({ tipo: ok ? 'exito' : 'error', texto });
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo probar' });
    }
  }

  if (!estado) return null;
  const listas = Object.values(llaves).every((v) => v.trim() !== '');
  return (
    <section className="tarjeta">
      <h3 className="tarjeta-titulo">
        <CreditCard size={18} /> Pagos en línea
      </h3>
      <p>
        Pasarela activa: <strong>{estado.proveedor === 'wompi' ? 'Wompi' : 'simulada'}</strong>
        {estado.proveedor === 'simulada' &&
          ' (modo de prueba: los links llevan a una página propia para aprobar o rechazar)'}
        .{' '}
        {estado.configurada ? (
          <>
            Cuenta de Wompi conectada ({estado.ambiente}
            {estado.actualizadoEn && `, ${formatearFechaHora(estado.actualizadoEn)}`}).
          </>
        ) : (
          'Cuenta de Wompi sin conectar.'
        )}
      </p>

      <form className="formulario-gerencia" onSubmit={guardar}>
        {CAMPOS.map(({ campo, etiqueta, ejemplo }) => (
          <div className="campo" key={campo}>
            <label htmlFor={`wompi-${campo}`}>{etiqueta}</label>
            <input
              id={`wompi-${campo}`}
              autoComplete="off"
              spellCheck={false}
              placeholder={estado.configurada ? 'Guardada (escribe otra para cambiarla)' : ejemplo}
              value={llaves[campo]}
              onChange={(e) => setLlaves({ ...llaves, [campo]: e.target.value })}
            />
          </div>
        ))}
        <div className="acciones-formulario">
          <button className="primario" disabled={!listas || guardando}>
            {guardando ? 'Guardando...' : 'Guardar llaves'}
          </button>
          <button type="button" className="secundario" onClick={probar}>
            <PlugZap size={15} /> Probar conexión
          </button>
        </div>
      </form>
      {mensaje && (
        <div className={mensaje.tipo === 'exito' ? 'mensaje-exito' : 'mensaje-error'}>
          {mensaje.texto}
        </div>
      )}

      <h4>Cuando tengas las llaves de Wompi</h4>
      <ol className="guia-wompi">
        <li>Crea la cuenta de comercio en Wompi y entra al ambiente de pruebas (sandbox).</li>
        <li>
          En «Mi cuenta → Secretos para integración técnica», copia la llave pública, la llave
          privada, el secreto de eventos y el secreto de integridad (solo los de pruebas).
        </li>
        <li>
          Pide a soporte que deje el backend con <code>PASARELA_PROVEEDOR=wompi</code> y una URL
          pública (<code>URL_PUBLICA_API</code>).
        </li>
        <li>Pega las 4 llaves aquí, guárdalas y pulsa «Probar conexión».</li>
        <li>
          En el panel de Wompi, pon esta URL de eventos:{' '}
          <code className="url-webhook">{estado.urlWebhook}</code>{' '}
          <button
            type="button"
            className="enlace"
            onClick={() => navigator.clipboard?.writeText(estado.urlWebhook)}
          >
            <Copy size={14} /> Copiar
          </button>
        </li>
        <li>
          Genera un link desde una reserva, págalo con los datos de prueba de Wompi y revisa que el
          pago aparezca en el folio en unos segundos.
        </li>
      </ol>
    </section>
  );
}
