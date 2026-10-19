import { BedDouble, Building2, CalendarCheck, Plus, Users } from 'lucide-react';
import type { HotelResumen } from '../../api/types';
import { iniciales } from '../../components/Marca';

interface Props {
  hoteles: HotelResumen[];
  onAbrir: (hotel: HotelResumen) => void;
  onNuevo: () => void;
}

// Los hoteles clientes de Lazaro, cada uno con su color y sus indicadores.
export function ListaHoteles({ hoteles, onAbrir, onNuevo }: Props) {
  const activos = hoteles.filter((h) => h.activo).length;
  const habitaciones = hoteles.reduce((s, h) => s + h.habitaciones, 0);

  return (
    <div>
      <div className="barra-titulo">
        <div>
          <h2>Hoteles</h2>
          <p className="texto-secundario">
            {hoteles.length} {hoteles.length === 1 ? 'hotel' : 'hoteles'} · {activos} activos ·{' '}
            {habitaciones} habitaciones en la plataforma
          </p>
        </div>
        <button className="acento" onClick={onNuevo}>
          <Plus size={16} /> Nuevo hotel
        </button>
      </div>

      {hoteles.length === 0 ? (
        <p className="vacio">Aún no hay hoteles. Crea el primero con “Nuevo hotel”.</p>
      ) : (
        <div className="grid-hoteles">
          {hoteles.map((h) => (
            <button
              key={h.id}
              className={`tarjeta-hotel ${h.activo ? '' : 'suspendido'}`}
              style={{ borderTopColor: h.colorPrimario }}
              onClick={() => onAbrir(h)}
            >
              <span className="tarjeta-hotel-cabecera">
                {h.logo ? (
                  <img className="tarjeta-hotel-logo" src={h.logo} alt="" />
                ) : (
                  <span
                    className="tarjeta-hotel-logo inicial"
                    style={{ background: h.colorPrimario, color: h.colorAcento }}
                  >
                    {iniciales(h.nombre)}
                  </span>
                )}
                <span>
                  <span className="tarjeta-hotel-nombre">{h.nombre}</span>
                  <span className="texto-secundario">
                    <Building2 size={13} /> {h.ciudad ?? 'Sin ciudad'} · {h.slug}
                  </span>
                </span>
              </span>
              <span className={`badge-estado ${h.activo ? 'libre' : 'cancelada'}`}>
                {h.activo ? 'Activo' : 'Suspendido'}
              </span>
              <span className="tarjeta-hotel-datos">
                <span>
                  <BedDouble size={14} /> {h.habitaciones} hab. · {h.ocupadasEstaNoche} ocupadas hoy
                </span>
                <span>
                  <CalendarCheck size={14} /> {h.reservasDelMes} reservas este mes
                </span>
                <span>
                  <Users size={14} /> {h.usuarios} {h.usuarios === 1 ? 'persona' : 'personas'} con
                  acceso
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
