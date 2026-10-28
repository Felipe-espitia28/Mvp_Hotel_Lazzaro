import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Play, RefreshCw, Wrench } from 'lucide-react';
import { api } from '../api/client';
import type { TareaLimpieza, TareasDelDia } from '../api/types';
import { ModalIncidencia } from '../components/ModalIncidencia';
import { ETIQUETA_ESTADO_TAREA, ETIQUETA_TIPO_TAREA, siguientePaso } from '../logica/limpieza';

// B-4: la vista de la camarera en el celular: sus habitaciones de hoy y las
// sin asignar, una por fila, con botones grandes. Terminar una "salida" deja
// la habitación lista para vender.
export function MisHabitaciones() {
  const [dia, setDia] = useState<TareasDelDia | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [reportando, setReportando] = useState<TareaLimpieza['habitacion'] | null>(null);

  const cargar = useCallback(async () => {
    try {
      setDia(await api.limpieza.tareas());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las tareas');
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function avanzar(tarea: TareaLimpieza) {
    const paso = siguientePaso(tarea);
    if (!paso) return;
    setProcesando(tarea.id);
    setAviso(null);
    try {
      await api.limpieza.avanzar(tarea.id, paso);
      if (paso === 'terminar' && tarea.tipo === 'salida') {
        setAviso(`La ${tarea.habitacion.numero} quedó lista`);
      }
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar la tarea');
    } finally {
      setProcesando(null);
    }
  }

  return (
    <div className="mis-habitaciones">
      <div className="cabecera-mis-habitaciones">
        <h2>Mis habitaciones de hoy</h2>
        {dia && (
          <p className="texto-secundario">
            {dia.avance.terminadas} de {dia.avance.total} listas ({dia.avance.porcentaje}%)
          </p>
        )}
        <button className="enlace" onClick={cargar}>
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>
      {error && <div className="mensaje-error">{error}</div>}
      {aviso && <div className="mensaje-exito">{aviso}</div>}
      {dia?.tareas.length === 0 && <p className="vacio">No tienes habitaciones por hacer hoy.</p>}
      <ul className="lista-tareas-camarera">
        {dia?.tareas.map((t) => {
          const paso = siguientePaso(t);
          return (
            <li key={t.id} className={`tarea-camarera ${t.estado}`}>
              <div className="tarea-camarera-datos">
                <span className="numero-habitacion">{t.habitacion.numero}</span>
                <span>
                  <strong>{ETIQUETA_TIPO_TAREA[t.tipo]}</strong> · {ETIQUETA_ESTADO_TAREA[t.estado]}
                  {!t.asignadaA && ' · sin asignar'}
                </span>
              </div>
              <div className="tarea-camarera-botones">
                {paso && (
                  <button
                    className="primario boton-grande"
                    disabled={procesando === t.id}
                    onClick={() => avanzar(t)}
                  >
                    {paso === 'iniciar' ? <Play size={18} /> : <CheckCircle2 size={18} />}
                    {paso === 'iniciar' ? 'Iniciar' : 'Terminar'}
                  </button>
                )}
                <button
                  className="secundario boton-grande"
                  onClick={() => setReportando(t.habitacion)}
                >
                  <Wrench size={18} /> Daño
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {reportando && (
        <ModalIncidencia
          habitacion={reportando}
          onCerrar={() => setReportando(null)}
          onReportada={(i) => {
            setReportando(null);
            setAviso(
              i.sacaDeServicio
                ? `Reportado: la ${i.habitacion.numero} quedó fuera de servicio`
                : 'Daño reportado a recepción',
            );
            cargar();
          }}
        />
      )}
    </div>
  );
}
