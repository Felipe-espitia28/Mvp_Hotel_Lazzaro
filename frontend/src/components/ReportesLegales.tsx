import { useEffect, useState } from 'react';
import { Download, FileWarning, Scale } from 'lucide-react';
import { api } from '../api/client';
import type { FilaSire, FilaTra, PendienteLegal } from '../api/types';
import {
  ETIQUETA_MOTIVO_VIAJE,
  ETIQUETA_TIPO_DOCUMENTO,
  formatearDinero,
  formatearFecha,
  hoyISO,
  nombrePais,
} from '../formato';

type Reporte = 'tra' | 'sire';

interface Props {
  // Abre la reserva (en la pestaña Reservas) buscando el documento del titular.
  onVerReserva: (documento: string) => void;
}

const lugar = (ciudad: string, pais: string) =>
  [ciudad, pais && nombrePais(pais)].filter(Boolean).join(', ') || '—';

// A-6: los datos de la TRA (MinCIT) y el SIRE (Migración) de un rango de
// fechas, con su vista previa, la descarga en CSV y las estadías que aún no
// se pueden reportar completas.
export function ReportesLegales({ onVerReserva }: Props) {
  const [desde, setDesde] = useState(() => `${hoyISO().slice(0, 8)}01`);
  const [hasta, setHasta] = useState(hoyISO);
  const [reporte, setReporte] = useState<Reporte>('tra');
  const [tra, setTra] = useState<FilaTra[] | null>(null);
  const [sire, setSire] = useState<FilaSire[] | null>(null);
  const [pendientes, setPendientes] = useState<PendienteLegal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [descargando, setDescargando] = useState(false);

  useEffect(() => {
    if (!desde || !hasta) return;
    Promise.all([
      api.reporteTra(desde, hasta),
      api.reporteSire(desde, hasta),
      api.pendientesLegales(desde, hasta),
    ])
      .then(([t, s, p]) => {
        setTra(t);
        setSire(s);
        setPendientes(p);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Error al cargar los reportes'));
  }, [desde, hasta]);

  async function descargar() {
    setDescargando(true);
    try {
      await api.descargarReporte(reporte, desde, hasta);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo descargar el archivo');
    } finally {
      setDescargando(false);
    }
  }

  const filas = reporte === 'tra' ? tra : sire;

  return (
    <section className="tarjeta seccion-registro">
      <div className="barra-titulo">
        <h3 className="tarjeta-titulo">
          <Scale size={18} /> Reportes legales
        </h3>
        <div className="fila-campos">
          <input
            type="date"
            aria-label="Desde"
            value={desde}
            max={hasta}
            onChange={(e) => e.target.value && setDesde(e.target.value)}
          />
          <input
            type="date"
            aria-label="Hasta"
            value={hasta}
            min={desde}
            onChange={(e) => e.target.value && setHasta(e.target.value)}
          />
        </div>
      </div>
      <p className="texto-secundario">
        Estadías con llegada entre el {formatearFecha(desde)} y el {formatearFecha(hasta)}. Suba
        este archivo o copie los datos en la plataforma oficial. El envío automático está pendiente
        (C-4).
      </p>
      {error && <div className="mensaje-error">{error}</div>}

      {pendientes.length > 0 && (
        <div className="mensaje-aviso">
          <strong>
            <FileWarning size={16} /> Datos por completar ({pendientes.length})
          </strong>
          <ul className="lista-pendientes">
            {pendientes.map((p) => (
              <li key={p.reservaId}>
                Habitación {p.habitacion}, llegada el {formatearFecha(p.fechaEntrada)}:{' '}
                {p.personas.map((x) => `${x.nombre} (falta ${x.faltan.join(', ')})`).join('; ')}
                {p.titular && (
                  <button
                    type="button"
                    className="enlace"
                    onClick={() => onVerReserva(p.titular!.documento)}
                  >
                    Ver la reserva
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="pestanas" role="tablist" aria-label="Reporte">
        {(
          [
            ['tra', 'TRA (MinCIT)', tra?.length],
            ['sire', 'SIRE (Migración)', sire?.length],
          ] as const
        ).map(([id, titulo, cuantas]) => (
          <button
            key={id}
            role="tab"
            aria-selected={reporte === id}
            className={`pestana ${reporte === id ? 'activa' : ''}`}
            onClick={() => setReporte(id)}
          >
            {titulo}
            {cuantas !== undefined && ` · ${cuantas}`}
          </button>
        ))}
        <button
          type="button"
          className="secundario"
          disabled={descargando || !filas?.length}
          onClick={descargar}
        >
          <Download size={16} /> {descargando ? 'Descargando...' : 'Descargar CSV'}
        </button>
      </div>

      {filas &&
        (filas.length === 0 ? (
          <p className="vacio">
            {reporte === 'tra'
              ? 'No hay estadías con llegada en esas fechas.'
              : 'No hay entradas ni salidas de extranjeros en esas fechas.'}
          </p>
        ) : (
          <div className="contenedor-tabla" role="tabpanel">
            {reporte === 'tra' ? <TablaTra filas={tra!} /> : <TablaSire filas={sire!} />}
          </div>
        ))}
    </section>
  );
}

function TablaTra({ filas }: { filas: FilaTra[] }) {
  return (
    <table className="tabla">
      <thead>
        <tr>
          <th>Hab.</th>
          <th>Huésped</th>
          <th>Residencia</th>
          <th>Procedencia</th>
          <th>Estadía</th>
          <th>Valor pagado</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((f) => (
          <tr key={`${f.reservaId}-${f.documento}`} className={f.titular ? '' : 'fila-acompanante'}>
            <td>{f.titular ? f.habitacion : ''}</td>
            <td>
              {f.nombres} {f.apellidos}
              <div className="texto-secundario">
                {ETIQUETA_TIPO_DOCUMENTO[f.tipoDocumento]} {f.documento}
                {f.titular && ` · titular con ${f.acompanantes} acompañante(s)`}
              </div>
            </td>
            <td>
              {lugar(f.ciudadResidencia, f.paisResidencia)}
              {f.codigoCiudadResidencia && (
                <div className="texto-secundario">DIVIPOLA {f.codigoCiudadResidencia}</div>
              )}
            </td>
            <td>
              {lugar(f.ciudadProcedencia, f.paisProcedencia)}
              {f.codigoCiudadProcedencia && (
                <div className="texto-secundario">DIVIPOLA {f.codigoCiudadProcedencia}</div>
              )}
            </td>
            <td>
              {formatearFecha(f.fechaEntrada)} → {formatearFecha(f.fechaSalida)}
              {f.motivoViaje && (
                <div className="texto-secundario">
                  {ETIQUETA_MOTIVO_VIAJE[f.motivoViaje as keyof typeof ETIQUETA_MOTIVO_VIAJE]}
                </div>
              )}
            </td>
            <td>{f.valorPagado ? formatearDinero(f.valorPagado) : f.titular ? 'En curso' : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TablaSire({ filas }: { filas: FilaSire[] }) {
  return (
    <table className="tabla">
      <thead>
        <tr>
          <th>Movimiento</th>
          <th>Fecha</th>
          <th>Huésped</th>
          <th>Nacionalidad</th>
          <th>Nacimiento</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((f) => (
          <tr key={`${f.reservaId}-${f.movimiento}-${f.documento}`}>
            <td>{f.movimiento === 'E' ? 'Entrada (E)' : 'Salida (S)'}</td>
            <td>{formatearFecha(f.fecha)}</td>
            <td>
              {f.apellidos} {f.nombres}
              <div className="texto-secundario">
                {ETIQUETA_TIPO_DOCUMENTO[f.tipoDocumento]} {f.documento}
              </div>
            </td>
            <td>{nombrePais(f.nacionalidad)}</td>
            <td>{f.fechaNacimiento ? formatearFecha(f.fechaNacimiento) : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
