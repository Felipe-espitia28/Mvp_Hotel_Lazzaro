import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { MedioPago, QuienToma, Reserva, TipoDocumento } from '../api/types';
import { useHotel } from '../contexto/HotelActual';
import { ETIQUETA_MEDIO_PAGO, ETIQUETA_TIPO_DOCUMENTO, formatearFecha } from '../formato';

interface Props {
  // Lo elegido, sin las personas (las pone quien usa el componente). null =
  // aún incompleto.
  onCambio: (quien: Pick<QuienToma, 'reservaId' | 'huesped' | 'pago'> | null) => void;
  // Una cita o un cupo de la propia reserva (desde su detalle).
  reservaInicial?: Reserva;
}

// S-2: quién toma una cita o un cupo: una reserva del hotel o un huésped
// externo. Sin una estadía activa no hay folio, así que se pide el medio del
// pago en el momento.
export function QuienTomaServicio({ onCambio, reservaInicial }: Props) {
  const { hotel } = useHotel();
  const medios: MedioPago[] = hotel?.politicas.mediosPago ?? ['efectivo'];
  const [modo, setModo] = useState<'reserva' | 'externo'>('reserva');
  const [buscar, setBuscar] = useState('');
  const [encontradas, setEncontradas] = useState<Reserva[]>([]);
  const [reserva, setReserva] = useState<Reserva | null>(reservaInicial ?? null);
  const [nombre, setNombre] = useState('');
  const [tipoDocumento, setTipoDocumento] = useState<TipoDocumento>('CC');
  const [documento, setDocumento] = useState('');
  const [medio, setMedio] = useState<MedioPago>(medios[0]);
  const [referencia, setReferencia] = useState('');

  // Busca entre las reservas que pueden tomar servicios: por llegar o alojados.
  useEffect(() => {
    if (modo !== 'reserva' || buscar.trim().length < 2) {
      setEncontradas([]);
      return;
    }
    let vigente = true;
    const espera = setTimeout(() => {
      api
        .listarReservas({ buscar: buscar.trim(), porPagina: 8 })
        .then((p) => {
          if (vigente) {
            setEncontradas(
              p.datos.filter((r) => r.estado === 'activa' || r.estado === 'confirmada'),
            );
          }
        })
        .catch(() => vigente && setEncontradas([]));
    }, 250);
    return () => {
      vigente = false;
      clearTimeout(espera);
    };
  }, [buscar, modo]);

  const pidePago = modo === 'externo' || (reserva !== null && reserva.estado !== 'activa');
  const pago = pidePago
    ? { medio, ...(referencia.trim() && { referencia: referencia.trim() }) }
    : undefined;

  useEffect(() => {
    if (modo === 'reserva') {
      onCambio(reserva ? { reservaId: reserva.id, pago } : null);
    } else {
      onCambio(
        nombre.trim() && documento.trim()
          ? { huesped: { nombre: nombre.trim(), tipoDocumento, documento: documento.trim() }, pago }
          : null,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, reserva, nombre, tipoDocumento, documento, medio, referencia]);

  return (
    <div className="quien-toma">
      {!reservaInicial && (
        <div className="pestanas" role="tablist" aria-label="Quién toma el servicio">
          {(
            [
              ['reserva', 'Huésped del hotel'],
              ['externo', 'Cliente externo'],
            ] as const
          ).map(([id, titulo]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={modo === id}
              className={`pestana ${modo === id ? 'activa' : ''}`}
              onClick={() => setModo(id)}
            >
              {titulo}
            </button>
          ))}
        </div>
      )}

      {modo === 'reserva' &&
        (reserva ? (
          <p>
            <strong>{reserva.huesped.nombre}</strong> · Hab. {reserva.habitacion.numero} ·{' '}
            {formatearFecha(reserva.fechaEntrada)} → {formatearFecha(reserva.fechaSalida)}
            {!reservaInicial && (
              <>
                {' '}
                <button type="button" className="enlace" onClick={() => setReserva(null)}>
                  Cambiar
                </button>
              </>
            )}
          </p>
        ) : (
          <div className="campo">
            <label htmlFor="quien-buscar">Buscar la reserva (nombre o documento)</label>
            <input
              id="quien-buscar"
              value={buscar}
              autoComplete="off"
              onChange={(e) => setBuscar(e.target.value)}
            />
            {encontradas.length > 0 && (
              <ul className="lista-opciones">
                {encontradas.map((r) => (
                  <li key={r.id}>
                    <button type="button" className="enlace" onClick={() => setReserva(r)}>
                      {r.huesped.nombre} · Hab. {r.habitacion.numero} ·{' '}
                      {r.estado === 'activa'
                        ? 'alojado'
                        : `llega ${formatearFecha(r.fechaEntrada)}`}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

      {modo === 'externo' && (
        <div className="fila-campos">
          <div className="campo crece">
            <label htmlFor="quien-nombre">Nombre</label>
            <input id="quien-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div className="campo">
            <label htmlFor="quien-tipo">Documento</label>
            <select
              id="quien-tipo"
              value={tipoDocumento}
              onChange={(e) => setTipoDocumento(e.target.value as TipoDocumento)}
            >
              {(['CC', 'CE', 'PASAPORTE', 'PPT'] as TipoDocumento[]).map((t) => (
                <option key={t} value={t}>
                  {ETIQUETA_TIPO_DOCUMENTO[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="quien-documento">Número</label>
            <input
              id="quien-documento"
              value={documento}
              onChange={(e) => setDocumento(e.target.value)}
            />
          </div>
        </div>
      )}

      {pidePago && (
        <div className="fila-campos">
          <p className="texto-secundario crece">
            Sin una estadía activa no hay folio: se paga en el momento.
          </p>
          <div className="campo">
            <label htmlFor="quien-medio">Medio de pago</label>
            <select
              id="quien-medio"
              value={medio}
              onChange={(e) => setMedio(e.target.value as MedioPago)}
            >
              {medios.map((m) => (
                <option key={m} value={m}>
                  {ETIQUETA_MEDIO_PAGO[m]}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="quien-referencia">Referencia</label>
            <input
              id="quien-referencia"
              value={referencia}
              placeholder="Opcional"
              onChange={(e) => setReferencia(e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
