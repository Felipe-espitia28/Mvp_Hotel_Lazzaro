import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Habitacion } from '../api/types';
import { TarjetaHabitacion } from '../components/TarjetaHabitacion';
import { ModalNuevaHabitacion } from '../components/ModalNuevaHabitacion';

interface Props {
  // Solo quien puede gestionar habitaciones (administrador) ve el botón de crear.
  puedeCrear: boolean;
}

export function TableroHabitaciones({ puedeCrear }: Props) {
  const [habitaciones, setHabitaciones] = useState<Habitacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarModal, setMostrarModal] = useState(false);

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

  return (
    <div>
      {puedeCrear && (
        <div className="barra-acciones">
          <button className="primario" onClick={() => setMostrarModal(true)}>
            + Nueva habitación
          </button>
        </div>
      )}

      {cargando ? (
        <p>Cargando...</p>
      ) : habitaciones.length === 0 ? (
        <p className="vacio">Aún no hay habitaciones registradas.</p>
      ) : (
        <div className="grid-habitaciones">
          {habitaciones.map((h) => (
            <TarjetaHabitacion key={h.id} habitacion={h} />
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
