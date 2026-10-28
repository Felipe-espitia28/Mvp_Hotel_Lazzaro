import { useState } from 'react';
import { Download, FileUp } from 'lucide-react';
import { ApiError } from '../api/client';
import type { InformeImportacion } from '../api/types';
import { leerArchivo, type FilaArchivo } from '../logica/archivo';
import { CabeceraModal } from './CabeceraModal';

const ETIQUETA_ESTADO = { crear: 'Nueva', actualizar: 'Se actualiza', error: 'Error' } as const;

interface Props<R> {
  titulo: string;
  // Columnas que se esperan en el archivo, para la ayuda.
  columnas: { nombre: string; descripcion: string }[];
  // Revisa las filas sin guardar nada (soloValidar).
  validar: (filas: FilaArchivo[]) => Promise<InformeImportacion>;
  // Guarda todas las filas o ninguna.
  aplicar: (filas: FilaArchivo[]) => Promise<R>;
  onPlantilla?: () => void;
  onImportado: (resultado: R) => void;
  onCerrar: () => void;
}

// A-4: importador genérico (el plan 09 lo reutiliza). Elegir el archivo →
// leerlo en el navegador → vista previa con el estado y los errores de cada
// fila → confirmar. Con una sola fila con error no se importa ninguna.
export function ImportadorArchivo<R>({
  titulo,
  columnas,
  validar,
  aplicar,
  onPlantilla,
  onImportado,
  onCerrar,
}: Props<R>) {
  const [nombreArchivo, setNombreArchivo] = useState('');
  const [filas, setFilas] = useState<FilaArchivo[]>([]);
  const [informe, setInforme] = useState<InformeImportacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  async function elegir(archivo: File | undefined) {
    if (!archivo) return;
    setNombreArchivo(archivo.name);
    setInforme(null);
    setError(null);
    setTrabajando(true);
    try {
      const leidas = await leerArchivo(archivo);
      setFilas(leidas);
      setInforme(await validar(leidas));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el archivo');
    } finally {
      setTrabajando(false);
    }
  }

  async function importar() {
    setError(null);
    setTrabajando(true);
    try {
      onImportado(await aplicar(filas));
    } catch (e) {
      // Si algo cambió entre la vista previa y la confirmación, el backend
      // responde con el informe actualizado.
      const cuerpo = e instanceof ApiError ? (e.cuerpo as { informe?: InformeImportacion }) : null;
      if (cuerpo?.informe) setInforme(cuerpo.informe);
      setError(e instanceof Error ? e.message : 'No se pudo importar');
    } finally {
      setTrabajando(false);
    }
  }

  const resumen = informe?.resumen;
  const listo = resumen !== undefined && resumen.error === 0 && resumen.total > 0;
  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal modal-ancho" onClick={(e) => e.stopPropagation()}>
        <CabeceraModal icono={FileUp} titulo={titulo} />
        <p className="texto-secundario">
          Un archivo .csv o .xlsx con una fila de encabezados:{' '}
          {columnas.map((c, i) => (
            <span key={c.nombre}>
              {i > 0 && ', '}
              <strong>{c.nombre}</strong> ({c.descripcion})
            </span>
          ))}
          . Hasta 500 filas; si una tiene un error, no se importa ninguna.
        </p>
        <div className="barra-titulo">
          <label className="boton-archivo">
            <FileUp size={16} /> {nombreArchivo || 'Elegir archivo'}
            <input
              type="file"
              accept=".csv,.xlsx"
              disabled={trabajando}
              onChange={(e) => {
                elegir(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
          {onPlantilla && (
            <button type="button" className="enlace" onClick={onPlantilla}>
              <Download size={14} /> Descargar plantilla
            </button>
          )}
        </div>

        {error && <div className="mensaje-error">{error}</div>}
        {trabajando && <p>Revisando el archivo...</p>}

        {informe && resumen && (
          <>
            <p className="texto-secundario">
              {resumen.total} filas: {resumen.crear} nuevas, {resumen.actualizar} se actualizan
              {resumen.error > 0 && (
                <>
                  , <strong>{resumen.error} con errores</strong> (corrígelas en el archivo y vuelve
                  a elegirlo)
                </>
              )}
              .
            </p>
            <div className="contenedor-tabla vista-previa-importacion">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Fila</th>
                    <th>Número</th>
                    <th>Estado</th>
                    <th>Errores</th>
                  </tr>
                </thead>
                <tbody>
                  {informe.filas.map((f) => (
                    <tr key={f.fila} className={f.estado === 'error' ? 'fila-error' : undefined}>
                      <td>{f.fila}</td>
                      <td>{f.numero || '—'}</td>
                      <td>{ETIQUETA_ESTADO[f.estado]}</td>
                      <td>{f.errores.join('. ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="acciones-modal">
          <button type="button" className="secundario" onClick={onCerrar}>
            Cancelar
          </button>
          <button className="primario" disabled={!listo || trabajando} onClick={importar}>
            {listo ? `Importar ${resumen.total}` : 'Importar'}
          </button>
        </div>
      </div>
    </div>
  );
}
