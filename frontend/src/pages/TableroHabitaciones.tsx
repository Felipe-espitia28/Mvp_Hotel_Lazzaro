import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../api/client';
import type { Habitacion } from '../api/types';
import { ETIQUETA_ESTADO_HABITACION } from '../formato';
import { TarjetaHabitacion } from '../components/TarjetaHabitacion';
import { ModalNuevaHabitacion } from '../components/ModalNuevaHabitacion';

interface Props {
  // Solo quien puede gestionar habitaciones (administrador) ve el botón de crear.
  puedeCrear: boolean;
  // Recepción y admin marcan habitaciones listas o fuera de servicio (R25, R26).
  puedeCambiarEstado: boolean;
}

export function TableroHabitaciones({ puedeCrear, puedeCambiarEstado }: Props) {
  const [habitaciones, setHabitaciones] = useState<Habitacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function cargar() {
    setCargando(true);
    try {
      setHabitaciones(await api.listarHabitaciones());
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  async function cambiarEstado(h: Habitacion, estado: 'libre' | 'fuera_servicio') {
    if (
      estado === 'fuera_servicio' &&
      !window.confirm(`¿Sacar de servicio la habitación ${h.numero}? No se ofrecerá para reservas.`)
    ) {
      return;
    }
    setError(null);
    setAviso(null);
    setProcesando(h.id);
    try {
      const resultado = await api.cambiarEstadoHabitacion(h.id, estado);
      setAviso(
        estado === 'libre'
          ? `Habitación ${h.numero} lista para el siguiente huésped.`
          : `Habitación ${h.numero} fuera de servicio.` +
              (resultado.reservasAfectadas > 0
                ? ` Atención: tiene ${resultado.reservasAfectadas} reserva(s) futura(s) por reubicar.`
                : ''),
      );
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar el estado');
    } finally {
      setProcesando(null);
    }
  }

  const conteo = (estado: Habitacion['estado']) =>
    habitaciones.filter((h) => h.estado === estado).length;

  return (
    <div>
      <div className="barra-titulo">
        <div>
          <h2>Habitaciones</h2>
          {habitaciones.length > 0 && (
            <div className="resumen-estados">
              {(['libre', 'ocupada', 'en_limpieza', 'fuera_servicio'] as const).map((e) => (
                <span key={e} className={`badge-estado ${e}`}>
                  {ETIQUETA_ESTADO_HABITACION[e]} · {conteo(e)}
                </span>
              ))}
            </div>
          )}
        </div>
        {puedeCrear && (
          <button className="acento" onClick={() => setMostrarModal(true)}>
            <Plus size={16} /> Nueva habitación
          </button>
        )}
      </div>
      {error && <div className="mensaje-error">{error}</div>}
      {aviso && <div className="mensaje-exito">{aviso}</div>}

      {cargando ? (
        <p>Cargando...</p>
      ) : habitaciones.length === 0 ? (
        <p className="vacio">Aún no hay habitaciones registradas.</p>
      ) : (
        <div className="grid-habitaciones">
          {habitaciones.map((h) => (
            <TarjetaHabitacion
              key={h.id}
              habitacion={h}
              procesando={procesando === h.id}
              onCambiarEstado={
                puedeCambiarEstado ? (estado) => cambiarEstado(h, estado) : undefined
              }
            />
          ))}
        </div>
      )}

      {mostrarModal && (
        <ModalNuevaHabitacion
          onCerrar={() => setMostrarModal(false)}
          onCreada={() => {
            setMostrarModal(false);
            cargar();
          }}
        />
      )}
    </div>
  );
}
