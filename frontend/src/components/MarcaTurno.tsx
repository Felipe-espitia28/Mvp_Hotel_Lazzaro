import { useCallback, useEffect, useState } from 'react';
import { Wallet } from 'lucide-react';
import { api } from '../api/client';
import type { Turno } from '../api/types';
import { formatearDinero } from '../formato';
import { leerMonto } from '../logica/caja';
import { ModalCerrarTurno } from './ModalCerrarTurno';

const hora = (instante: string) =>
  new Date(instante).toLocaleTimeString('es-CO', {
    timeZone: 'America/Bogota',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

// B-3: en la barra superior, el turno de caja de quien usa la app: "Turno
// abierto desde las 07:02" con el botón para cerrarlo, o el de abrirlo. Sin
// turno se puede seguir trabajando: los pagos quedan "sin turno".
export function MarcaTurno() {
  const [turno, setTurno] = useState<Turno | null | undefined>(undefined);
  const [cerrando, setCerrando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setTurno((await api.turnos.actual()).turno);
    } catch {
      setTurno(null);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function abrir() {
    const texto = window.prompt('¿Con cuánto efectivo empieza el turno? (base de la caja)', '0');
    if (texto === null) return;
    const base = leerMonto(texto);
    if (base === null) {
      setAviso('Escribe la base como un número, p. ej. 100.000');
      return;
    }
    try {
      setTurno(await api.turnos.abrir(base));
      setAviso(null);
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No se pudo abrir el turno');
    }
  }

  if (turno === undefined) return null;
  return (
    <div className="marca-turno" role="status" title={aviso ?? undefined}>
      <Wallet size={15} />
      {turno ? (
        <>
          <span>Turno abierto desde las {hora(turno.abiertoEn)}</span>
          <button
            type="button"
            className="enlace"
            onClick={async () => {
              // El resumen se pide de nuevo: pudo haber pagos desde que se abrió.
              await cargar();
              setCerrando(true);
            }}
          >
            Cerrar
          </button>
        </>
      ) : (
        <>
          <span className={aviso ? 'etiqueta-atrasada' : undefined}>
            {aviso ?? 'Sin turno de caja'}
          </span>
          <button type="button" className="enlace" onClick={abrir}>
            Abrir turno
          </button>
        </>
      )}
      {cerrando && turno && (
        <ModalCerrarTurno
          turno={turno}
          onCerrar={() => setCerrando(false)}
          onCerrado={(cerrado) => {
            setCerrando(false);
            setTurno(null);
            const diferencia = cerrado.resumen.diferencia ?? 0;
            setAviso(
              diferencia === 0
                ? 'Turno cerrado: la caja cuadra'
                : `Turno cerrado con una diferencia de ${formatearDinero(diferencia)}`,
            );
          }}
        />
      )}
    </div>
  );
}
