import { useState } from 'react';
import { api, ApiError } from '../api/client';
import type { HabitacionDisponible, HuespedResumen, Reserva, TipoDocumento } from '../api/types';
import { DesgloseTarifa } from '../components/DesgloseTarifa';
import { ETIQUETA_TIPO_DOCUMENTO, formatearDinero, hoyISO, textoCancelacion } from '../formato';

export function NuevaReserva() {
  const [fechaEntrada, setFechaEntrada] = useState('');
  const [fechaSalida, setFechaSalida] = useState('');
  const [huespedes, setHuespedes] = useState(1);
  const [disponibles, setDisponibles] = useState<HabitacionDisponible[] | null>(null);
  const [habitacionId, setHabitacionId] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [tipoDocumento, setTipoDocumento] = useState<TipoDocumento>('CC');
  const [documento, setDocumento] = useState('');
  // undefined: aún no se consulta; null: cliente nuevo; objeto: cliente registrado.
  const [registrado, setRegistrado] = useState<HuespedResumen | null | undefined>(undefined);
  const [telefono, setTelefono] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [reservando, setReservando] = useState(false);
  const [creada, setCreada] = useState<Reserva | null>(null);

  const hoy = hoyISO();
  const seleccionada = disponibles?.find((h) => h.id === habitacionId);

  async function buscarDisponibles() {
    setError(null);
    setCreada(null);
    setHabitacionId(null);
    setBuscando(true);
    try {
      setDisponibles(await api.disponibles(fechaEntrada, fechaSalida, huespedes));
    } catch (e) {
      setDisponibles(null);
      setError(e instanceof Error ? e.message : 'Error al consultar disponibilidad');
    } finally {
      setBuscando(false);
    }
  }

  // Si cambia el documento, se olvida al cliente reconocido (y sus datos precargados).
  function olvidarHuesped() {
    if (registrado) {
      setNombre('');
      setTelefono('');
    }
    setRegistrado(undefined);
  }

  // Al terminar de escribir el documento, reconoce si el cliente ya vino antes.
  async function reconocerHuesped() {
    if (!documento.trim()) return;
    try {
      const encontrado = await api.huespedPorDocumento(tipoDocumento, documento);
      setRegistrado(encontrado);
      if (encontrado) {
        setNombre(encontrado.nombre);
        setTelefono(encontrado.telefono ?? '');
      }
    } catch {
      setRegistrado(undefined); // Si falla la consulta, se sigue como cliente nuevo.
    }
  }

  async function confirmarReserva() {
    if (!habitacionId) return;
    setError(null);
    setReservando(true);
    try {
      setCreada(
        await api.crearReserva({
          habitacionId,
          huesped: { nombre, tipoDocumento, documento, telefono: telefono || undefined },
          numeroHuespedes: huespedes,
          fechaEntrada,
          fechaSalida,
        }),
      );
      setDisponibles(null);
      setHabitacionId(null);
      setNombre('');
      setDocumento('');
      setTelefono('');
      setRegistrado(undefined);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setError('Esa habitación ya no está disponible en esas fechas. Elige otra.');
        // Refresca la lista para que desaparezca la que se acaba de ocupar.
        buscarDisponibles();
      } else {
        setError(e instanceof Error ? e.message : 'Error al crear la reserva');
      }
    } finally {
      setReservando(false);
    }
  }

  return (
    <div>
      <h2>Nueva reserva</h2>
      {error && <div className="mensaje-error">{error}</div>}
      {creada && (
        <div className="mensaje-exito">
          Reserva confirmada: habitación {creada.habitacion.numero}, {creada.noches}{' '}
          {creada.noches === 1 ? 'noche' : 'noches'} por{' '}
          <strong>{formatearDinero(creada.valorAlojamiento)}</strong> (precio garantizado).{' '}
          {textoCancelacion(creada.cancelacionGratuitaHasta)}.
        </div>
      )}

      <div className="campo">
        <label htmlFor="entrada">Fecha de entrada</label>
        <input
          id="entrada"
          type="date"
          min={hoy}
          value={fechaEntrada}
          onChange={(e) => setFechaEntrada(e.target.value)}
        />
      </div>
      <div className="campo">
        <label htmlFor="salida">Fecha de salida</label>
        <input
          id="salida"
          type="date"
          min={fechaEntrada || hoy}
          value={fechaSalida}
          onChange={(e) => setFechaSalida(e.target.value)}
        />
      </div>
      <div className="campo">
        <label htmlFor="huespedes">Huéspedes</label>
        <input
          id="huespedes"
          type="number"
          min={1}
          max={10}
          value={huespedes}
          onChange={(e) => {
            setHuespedes(Math.max(1, Number(e.target.value) || 1));
            setDisponibles(null); // la disponibilidad y el precio dependen de los huéspedes
          }}
        />
      </div>
      <button
        className="primario"
        disabled={!fechaEntrada || !fechaSalida || buscando}
        onClick={buscarDisponibles}
      >
        {buscando ? 'Buscando...' : 'Ver disponibles'}
      </button>

      {disponibles && (
        <div className="lista-disponibles">
          {disponibles.length === 0 ? (
            <p className="vacio">No hay habitaciones disponibles en ese rango.</p>
          ) : (
            disponibles.map((h) => (
              <div
                key={h.id}
                className={`opcion-disponible ${habitacionId === h.id ? 'seleccionada' : ''}`}
                onClick={() => setHabitacionId(h.id)}
              >
                <span>
                  {h.numero} · {h.tipoHabitacion.nombre}
                  <span className="texto-secundario">
                    {' '}
                    (hasta {h.tipoHabitacion.capacidadMaxima} huéspedes)
                  </span>
                </span>
                <span>
                  <strong>{formatearDinero(h.cotizacion.total)}</strong>{' '}
                  <span className="texto-secundario">IVA incluido</span>
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {seleccionada && (
        <div style={{ marginTop: 20 }}>
          <h3>Datos del huésped</h3>
          <div className="fila-campos">
            <div className="campo">
              <label htmlFor="tipo-documento">Tipo de documento</label>
              <select
                id="tipo-documento"
                value={tipoDocumento}
                onChange={(e) => {
                  setTipoDocumento(e.target.value as TipoDocumento);
                  olvidarHuesped();
                }}
              >
                {Object.entries(ETIQUETA_TIPO_DOCUMENTO).map(([valor, etiqueta]) => (
                  <option key={valor} value={valor}>
                    {etiqueta}
                  </option>
                ))}
              </select>
            </div>
            <div className="campo crece">
              <label htmlFor="documento">Número de documento</label>
              <input
                id="documento"
                value={documento}
                onChange={(e) => {
                  setDocumento(e.target.value);
                  olvidarHuesped();
                }}
                onBlur={reconocerHuesped}
              />
            </div>
          </div>
          {registrado && (
            <div className="mensaje-aviso">
              Cliente registrado: <strong>{registrado.nombre}</strong> ·{' '}
              {registrado._count.reservas}{' '}
              {registrado._count.reservas === 1 ? 'reserva anterior' : 'reservas anteriores'}.
            </div>
          )}
          {registrado === null && <p className="texto-secundario">Cliente nuevo.</p>}
          <div className="campo">
            <label htmlFor="nombre">Nombre</label>
            <input
              id="nombre"
              value={nombre}
              disabled={!!registrado}
              title={registrado ? 'Se conserva el nombre registrado del cliente' : undefined}
              onChange={(e) => setNombre(e.target.value)}
            />
          </div>
          <div className="campo">
            <label htmlFor="telefono">Teléfono (opcional)</label>
            <input id="telefono" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          </div>
          <h3>Precio de la estadía</h3>
          <DesgloseTarifa
            desglose={seleccionada.cotizacion}
            exentoIva={tipoDocumento === 'PASAPORTE'}
          />
          <p className="texto-secundario">El precio queda garantizado al confirmar.</p>
          <button
            className="primario"
            disabled={!nombre || !documento || reservando}
            onClick={confirmarReserva}
          >
            {reservando ? 'Confirmando...' : 'Confirmar reserva'}
          </button>
        </div>
      )}
    </div>
  );
}
