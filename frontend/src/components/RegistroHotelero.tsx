import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { api } from '../api/client';
import type { FilaRegistroHotelero } from '../api/types';
import {
  ETIQUETA_MOTIVO_VIAJE,
  ETIQUETA_TIPO_DOCUMENTO,
  formatearFecha,
  hoyISO,
  nombrePais,
} from '../formato';

// R19: registro hotelero del día (llegadas con check-in), con los datos que
// piden la Tarjeta de Registro Hotelero y, para extranjeros, Migración.
export function RegistroHotelero() {
  const [fecha, setFecha] = useState(hoyISO());
  const [registros, setRegistros] = useState<FilaRegistroHotelero[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .registroHotelero(fecha)
      .then((r) => {
        setRegistros(r.registros);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Error al cargar el registro'));
  }, [fecha]);

  const extranjeros = registros?.filter((r) => r.extranjero).length ?? 0;

  return (
    <section className="tarjeta seccion-registro">
      <div className="barra-titulo">
        <h3 className="tarjeta-titulo">
          <FileText size={18} /> Registro hotelero
        </h3>
        <input
          type="date"
          aria-label="Día de llegada"
          value={fecha}
          onChange={(e) => e.target.value && setFecha(e.target.value)}
        />
      </div>
      <p className="texto-secundario">
        Huéspedes que hicieron check-in con llegada el {formatearFecha(fecha)}: datos para la
        Tarjeta de Registro Hotelero
        {extranjeros > 0 && ` · ${extranjeros} extranjero(s) para reportar a Migración`}.
      </p>
      {error && <div className="mensaje-error">{error}</div>}
      {registros &&
        (registros.length === 0 ? (
          <p className="vacio">No hay check-ins con esa fecha de llegada.</p>
        ) : (
          <div className="contenedor-tabla">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Hab.</th>
                  <th>Huésped</th>
                  <th>Nacionalidad</th>
                  <th>Procedencia</th>
                  <th>Motivo</th>
                  <th>Estadía</th>
                </tr>
              </thead>
              <tbody>
                {registros.map((r) => (
                  <tr key={r.reservaId}>
                    <td>{r.habitacion}</td>
                    <td>
                      {r.nombre}
                      <div className="texto-secundario">
                        {ETIQUETA_TIPO_DOCUMENTO[r.tipoDocumento]} {r.documento}
                      </div>
                    </td>
                    <td>
                      {nombrePais(r.nacionalidad)}
                      {r.extranjero && <span className="badge-estado no_show">Extranjero</span>}
                    </td>
                    <td>{r.procedencia ?? '—'}</td>
                    <td>{r.motivoViaje ? ETIQUETA_MOTIVO_VIAJE[r.motivoViaje] : '—'}</td>
                    <td>
                      {formatearFecha(r.fechaEntrada)} → {formatearFecha(r.fechaSalida)}
                      <div className="texto-secundario">
                        {r.numeroHuespedes} {r.numeroHuespedes === 1 ? 'huésped' : 'huéspedes'}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </section>
  );
}
