import { LogIn } from 'lucide-react';
import { CabeceraModal } from './CabeceraModal';
import { TarjetaOcupante } from './TarjetaOcupante';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, api } from '../api/client';
import type { MotivoViaje, PoliticaDatos, Reserva } from '../api/types';
import { ETIQUETA_MOTIVO_VIAJE, formatearFechaHora } from '../formato';
import { resumenHuespedes } from '../logica/edades';
import {
  aCuerpoCheckIn,
  agruparProblemas,
  esMenor,
  ocupanteDesdeHuesped,
  ocupanteVacio,
  type FormularioOcupante,
} from '../logica/ocupantes';

interface Props {
  reserva: Pick<
    Reserva,
    'id' | 'huesped' | 'habitacion' | 'numeroHuespedes' | 'fechaEntrada' | 'adultos' | 'edadesNinos'
  >;
  onCerrar: () => void;
  // A-3: `avisos` dice si las edades registradas no son las declaradas.
  onHecho: (reserva: Reserva & { avisos: string[] }) => void;
}

const sinProblemas = { porOcupante: {}, generales: [] } as ReturnType<typeof agruparProblemas>;

// R19, R43–R45: el check-in registra a cada ocupante de la reserva con sus
// datos legales. Hay una tarjeta por huésped de la reserva (el backend exige
// ese número); la primera es el titular, precargado con lo que ya se sabe.
export function ModalCheckIn({ reserva, onCerrar, onHecho }: Props) {
  const [motivoViaje, setMotivoViaje] = useState<MotivoViaje>('turismo');
  const [ocupantes, setOcupantes] = useState<FormularioOcupante[]>(() => [
    ocupanteDesdeHuesped(reserva.huesped),
    ...Array.from({ length: reserva.numeroHuespedes - 1 }, () =>
      ocupanteVacio({ responsableIndice: 0 }),
    ),
  ]);
  const [politica, setPolitica] = useState<PoliticaDatos | null>(null);
  const [problemas, setProblemas] = useState(sinProblemas);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api
      .politicaDatos()
      .then(setPolitica)
      .catch(() => setPolitica(null));
  }, []);

  const fechaEntrada = reserva.fechaEntrada.slice(0, 10);
  const titularPorCompletar = !ocupantes[0].nombresBloqueados ? reserva.huesped.nombre : undefined;
  const adultos = ocupantes
    .map((o, indice) => ({ o, indice }))
    .filter(({ o }) => !esMenor(o, fechaEntrada))
    .map(({ o, indice }) => ({
      indice,
      nombre: [o.primerNombre, o.primerApellido].join(' ').trim() || `Ocupante ${indice + 1}`,
    }));
  const extranjeros = ocupantes.filter((o) => o.nacionalidad && o.nacionalidad !== 'CO').length;

  function cambiarOcupante(indice: number, ocupante: FormularioOcupante) {
    setOcupantes((actuales) => actuales.map((o, i) => (i === indice ? ocupante : o)));
  }

  async function confirmar(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    setProblemas(sinProblemas);
    setEnviando(true);
    try {
      onHecho(await api.checkIn(reserva.id, aCuerpoCheckIn(motivoViaje, ocupantes, fechaEntrada)));
    } catch (e) {
      // Con problemas por campo, cada uno se marca en su tarjeta; si no, el mensaje general.
      if (e instanceof ApiError && e.problemas.length > 0) {
        setProblemas(agruparProblemas(e.problemas));
        setError('Revisa los datos marcados en cada ocupante.');
      } else {
        setError(e instanceof Error ? e.message : 'No se pudo hacer el check-in');
      }
      setEnviando(false);
    }
  }

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal modal-ancho" onClick={(e) => e.stopPropagation()}>
        <CabeceraModal icono={LogIn} titulo="Check-in" />
        <p className="texto-secundario">
          {reserva.huesped.nombre} · habitación {reserva.habitacion.numero} ·{' '}
          {resumenHuespedes(reserva.adultos, reserva.edadesNinos)}
        </p>
        {error && (
          <div className="mensaje-error" role="alert">
            {error}
            {problemas.generales.map((p) => (
              <div key={p}>{p}</div>
            ))}
          </div>
        )}
        <form onSubmit={confirmar} noValidate>
          <div className="campo">
            <label htmlFor="motivo">Motivo del viaje</label>
            <select
              id="motivo"
              value={motivoViaje}
              onChange={(e) => setMotivoViaje(e.target.value as MotivoViaje)}
            >
              {Object.entries(ETIQUETA_MOTIVO_VIAJE).map(([valor, etiqueta]) => (
                <option key={valor} value={valor}>
                  {etiqueta}
                </option>
              ))}
            </select>
          </div>

          {politica && (
            <details className="politica-datos">
              <summary>
                Política de tratamiento de datos (versión {politica.version}, vigente desde el{' '}
                {formatearFechaHora(politica.vigenteDesde)})
              </summary>
              <p>{politica.texto}</p>
            </details>
          )}

          {ocupantes.map((o, indice) => (
            <TarjetaOcupante
              key={indice}
              indice={indice}
              ocupante={o}
              onCambiar={(nuevo) => cambiarOcupante(indice, nuevo)}
              titular={ocupantes[0]}
              adultos={adultos.filter((a) => a.indice !== indice)}
              fechaEntrada={fechaEntrada}
              problemas={problemas.porOcupante[indice] ?? {}}
              versionPolitica={politica?.version ?? null}
              nombreRegistrado={indice === 0 ? titularPorCompletar : undefined}
            />
          ))}

          <p className="texto-secundario">
            Datos del registro hotelero obligatorio (TRA)
            {extranjeros > 0 && ': los extranjeros se reportan también a Migración'}. Para cambiar
            el número de huéspedes, modifica la reserva.
          </p>
          <div className="acciones-modal">
            <button type="button" className="secundario" onClick={onCerrar}>
              Cancelar
            </button>
            <button type="submit" className="primario" disabled={enviando}>
              {enviando ? 'Registrando...' : 'Confirmar check-in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
