import { useMemo, useState } from 'react';
import { ArrowLeft, Ban, CircleCheck, LogIn } from 'lucide-react';
import { api } from '../../api/client';
import type { HotelResumen } from '../../api/types';
import { Usuarios } from '../Usuarios';

interface Props {
  hotel: HotelResumen;
  onVolver: () => void;
  onCambio: (hotel: HotelResumen) => void;
}

// Un hotel cliente: su estado y las personas con acceso.
export function DetalleHotel({ hotel, onVolver, onCambio }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  // Memorizado: la pantalla de equipo recarga cuando cambia esta fuente.
  const gestion = useMemo(() => api.plataforma.equipoDe(hotel.id), [hotel.id]);
  const enlaceIngreso = `${window.location.origin}/?hotel=${hotel.slug}`;

  async function cambiarEstado() {
    if (
      hotel.activo &&
      !window.confirm(
        `¿Suspender ${hotel.nombre}? Nadie de su equipo podrá entrar hasta que lo reactives.`,
      )
    ) {
      return;
    }
    setError(null);
    setProcesando(true);
    try {
      const actualizado = await api.plataforma.actualizarHotel(hotel.id, { activo: !hotel.activo });
      onCambio({ ...hotel, ...actualizado });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar el estado');
    } finally {
      setProcesando(false);
    }
  }

  return (
    <div>
      <button className="enlace" onClick={onVolver}>
        <ArrowLeft size={14} /> Todos los hoteles
      </button>
      <div className="barra-titulo" style={{ marginTop: 12 }}>
        <div>
          <h2>{hotel.nombre}</h2>
          <p className="texto-secundario">
            {hotel.ciudad ?? 'Sin ciudad'} · identificador <strong>{hotel.slug}</strong>
          </p>
        </div>
        <button
          className={hotel.activo ? 'peligro' : 'acento'}
          disabled={procesando}
          onClick={cambiarEstado}
        >
          {hotel.activo ? <Ban size={16} /> : <CircleCheck size={16} />}
          {hotel.activo ? 'Suspender hotel' : 'Reactivar hotel'}
        </button>
      </div>
      {error && <div className="mensaje-error">{error}</div>}
      {!hotel.activo && (
        <div className="mensaje-aviso">
          Hotel suspendido: su equipo no puede entrar. Sus datos se conservan.
        </div>
      )}

      <section className="tarjeta" style={{ marginBottom: 20 }}>
        <h3 className="tarjeta-titulo">
          <LogIn size={18} /> Ingreso con la marca del hotel
        </h3>
        <p className="texto-secundario">
          Comparte esta dirección con el equipo del hotel: el ingreso muestra su logo y sus colores.
        </p>
        <code className="enlace-ingreso">{enlaceIngreso}</code>
      </section>

      <Usuarios gestion={gestion} titulo="Personas con acceso" />
    </div>
  );
}
