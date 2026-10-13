import { useState, type FormEvent } from 'react';
import { api } from '../api/client';
import type { MotivoViaje, Reserva } from '../api/types';
import { ETIQUETA_MOTIVO_VIAJE, PAISES } from '../formato';

interface Props {
  reserva: Pick<Reserva, 'id' | 'huesped' | 'habitacion'>;
  onCerrar: () => void;
  onHecho: (reserva: Reserva) => void;
}

// R19: el check-in completa el registro hotelero del huésped. La nacionalidad
// se precarga si ya vino antes.
export function ModalCheckIn({ reserva, onCerrar, onHecho }: Props) {
  const [nacionalidad, setNacionalidad] = useState(reserva.huesped.nacionalidad ?? 'CO');
  const [procedencia, setProcedencia] = useState('');
  const [motivoViaje, setMotivoViaje] = useState<MotivoViaje>('turismo');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function confirmar(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      onHecho(await api.checkIn(reserva.id, { nacionalidad, procedencia, motivoViaje }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo hacer el check-in');
      setEnviando(false);
    }
  }

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Check-in</h2>
        <p className="texto-secundario">
          {reserva.huesped.nombre} · habitación {reserva.habitacion.numero}
        </p>
        {error && <div className="mensaje-error">{error}</div>}
        <form onSubmit={confirmar}>
          <div className="campo">
            <label htmlFor="nacionalidad">Nacionalidad</label>
            <select
              id="nacionalidad"
              value={nacionalidad}
              onChange={(e) => setNacionalidad(e.target.value)}
            >
              {Object.entries(PAISES).map(([codigo, nombre]) => (
                <option key={codigo} value={codigo}>
                  {nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="procedencia">Procedencia (ciudad de donde viene)</label>
            <input
              id="procedencia"
              value={procedencia}
              onChange={(e) => setProcedencia(e.target.value)}
              required
            />
          </div>
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
          <p className="texto-secundario">
            Datos del registro hotelero obligatorio
            {nacionalidad !== 'CO' && ' (huésped extranjero: se reporta también a Migración)'}.
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
