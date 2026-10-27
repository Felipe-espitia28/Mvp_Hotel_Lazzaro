import { useEffect, useState, type FormEvent } from 'react';
import { Save } from 'lucide-react';
import { api } from '../../api/client';
import { useHotel } from '../../contexto/HotelActual';

// Datos generales del hotel: nombre visible para todo el equipo, ciudad, NIT,
// teléfono y tipo de alojamiento (dato de la TRA).
export function DatosHotel() {
  const { hotel, recargar } = useHotel();
  const [nombre, setNombre] = useState(hotel?.nombre ?? '');
  const [ciudad, setCiudad] = useState(hotel?.ciudad ?? '');
  const [nit, setNit] = useState(hotel?.nit ?? '');
  const [telefono, setTelefono] = useState(hotel?.telefono ?? '');
  const [tipoAlojamiento, setTipoAlojamiento] = useState(hotel?.tipoAlojamiento ?? 'Hotel');
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Si el hotel termina de cargar después de abrir la pestaña, se rellena.
  useEffect(() => {
    if (!hotel) return;
    setNombre(hotel.nombre);
    setCiudad(hotel.ciudad ?? '');
    setNit(hotel.nit ?? '');
    setTelefono(hotel.telefono ?? '');
    setTipoAlojamiento(hotel.tipoAlojamiento);
  }, [hotel]);

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    setAviso(null);
    setGuardando(true);
    try {
      await api.actualizarDatosHotel({ nombre, ciudad, nit, telefono, tipoAlojamiento });
      await recargar();
      setAviso('Datos del hotel guardados.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron guardar los datos');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="tarjeta">
      <h3 className="tarjeta-titulo">Datos del hotel</h3>
      {error && <div className="mensaje-error">{error}</div>}
      {aviso && <div className="mensaje-exito">{aviso}</div>}
      <form onSubmit={guardar} className="formulario-gerencia">
        <div className="campo">
          <label htmlFor="hotel-nombre">Nombre del hotel</label>
          <input
            id="hotel-nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
            maxLength={80}
          />
        </div>
        <div className="fila-campos">
          <div className="campo crece">
            <label htmlFor="hotel-ciudad">Ciudad</label>
            <input
              id="hotel-ciudad"
              value={ciudad}
              onChange={(e) => setCiudad(e.target.value)}
              maxLength={60}
            />
          </div>
          <div className="campo crece">
            <label htmlFor="hotel-nit">NIT</label>
            <input
              id="hotel-nit"
              value={nit}
              onChange={(e) => setNit(e.target.value)}
              maxLength={30}
            />
          </div>
          <div className="campo crece">
            <label htmlFor="hotel-telefono">Teléfono</label>
            <input
              id="hotel-telefono"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              maxLength={30}
            />
          </div>
        </div>
        <div className="campo">
          <label htmlFor="hotel-tipo-alojamiento">Tipo de alojamiento (dato de la TRA)</label>
          <input
            id="hotel-tipo-alojamiento"
            value={tipoAlojamiento}
            onChange={(e) => setTipoAlojamiento(e.target.value)}
            required
            maxLength={40}
            placeholder="Hotel, hostal, apartahotel..."
          />
        </div>
        <p className="texto-secundario">
          Identificador del hotel: <strong>{hotel?.slug}</strong> (lo asigna Lazaro; va en la
          dirección del ingreso con tu marca).
        </p>
        <button className="acento" disabled={guardando}>
          <Save size={16} /> {guardando ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </form>
    </section>
  );
}
