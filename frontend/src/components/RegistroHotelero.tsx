import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { api } from '../api/client';
import type { FilaRegistroHotelero } from '../api/types';
import {
  ETIQUETA_MOTIVO_VIAJE,
  ETIQUETA_PARENTESCO,
  ETIQUETA_TIPO_DOCUMENTO,
  formatearFecha,
  hoyISO,
  nombrePais,
} from '../formato';

// R19, R43: registro hotelero del día (llegadas con check-in): una fila por
// persona, el titular con sus acompañantes debajo, con los datos que piden la
// Tarjeta de Registro de Alojamiento y, para extranjeros, Migración.
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

  const personas = registros?.flatMap((r) => r.ocupantes) ?? [];
  const extranjeros = personas.filter((o) => o.extranjero).length;
  const menores = personas.filter((o) => o.menor).length;

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
        Tarjeta de Registro de Alojamiento
        {extranjeros > 0 && ` · ${extranjeros} extranjero(s) para reportar a Migración`}
        {menores > 0 && ` · ${menores} menor(es) de edad`}.
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
                {registros.flatMap((r) =>
                  r.ocupantes.map((o, i) => (
                    <tr
                      key={`${r.reservaId}-${o.documento}`}
                      className={i > 0 ? 'fila-acompanante' : ''}
                    >
                      {i === 0 && <td rowSpan={r.ocupantes.length}>{r.habitacion}</td>}
                      <td>
                        {o.nombre}
                        <div className="texto-secundario">
                          {ETIQUETA_TIPO_DOCUMENTO[o.tipoDocumento]} {o.documento}
                          {o.titular ? ' · titular' : ''}
                          {o.parentesco && ` · ${ETIQUETA_PARENTESCO[o.parentesco].toLowerCase()}`}
                        </div>
                      </td>
                      <td>
                        {nombrePais(o.nacionalidad)}
                        {o.extranjero && <span className="badge-estado no_show">Extranjero</span>}
                        {o.menor && (
                          <span className="badge-estado confirmada">Menor · {o.edad} años</span>
                        )}
                      </td>
                      <td>
                        {[o.ciudadProcedencia, o.paisProcedencia && nombrePais(o.paisProcedencia)]
                          .filter(Boolean)
                          .join(', ') || '—'}
                      </td>
                      {i === 0 && (
                        <>
                          <td rowSpan={r.ocupantes.length}>
                            {r.motivoViaje ? ETIQUETA_MOTIVO_VIAJE[r.motivoViaje] : '—'}
                          </td>
                          <td rowSpan={r.ocupantes.length}>
                            {formatearFecha(r.fechaEntrada)} → {formatearFecha(r.fechaSalida)}
                            <div className="texto-secundario">
                              {r.numeroHuespedes}{' '}
                              {r.numeroHuespedes === 1 ? 'huésped' : 'huéspedes'}
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        ))}
    </section>
  );
}
