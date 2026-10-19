import { useState } from 'react';
import {
  Building2,
  CalendarRange,
  Scale,
  ShoppingBag,
  Tags,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../../api/client';
import { useHotel } from '../../contexto/HotelActual';
import { Tarifas } from '../Tarifas';
import { Usuarios } from '../Usuarios';
import { DatosHotel } from './DatosHotel';
import { PoliticasHotel } from './PoliticasHotel';
import { TemporadasHotel } from './TemporadasHotel';
import { CatalogoConsumos } from './CatalogoConsumos';

type Seccion = 'politicas' | 'temporadas' | 'precios' | 'consumos' | 'equipo' | 'datos';

const SECCIONES: { id: Seccion; titulo: string; icono: LucideIcon }[] = [
  { id: 'politicas', titulo: 'Políticas', icono: Scale },
  { id: 'temporadas', titulo: 'Temporadas', icono: CalendarRange },
  { id: 'precios', titulo: 'Precios y habitaciones', icono: Tags },
  { id: 'consumos', titulo: 'Consumos', icono: ShoppingBag },
  { id: 'equipo', titulo: 'Equipo', icono: Users },
  { id: 'datos', titulo: 'Datos del hotel', icono: Building2 },
];

interface Props {
  idUsuarioActual: string;
}

// Gerencia del hotel: el panel del administrador para personalizar SU hotel.
// Lo que cambia aquí aplica a todo su equipo; la operación diaria (reservas,
// check-in, folio) sigue en las demás pantallas.
export function Gerencia({ idUsuarioActual }: Props) {
  const { hotel } = useHotel();
  const [seccion, setSeccion] = useState<Seccion>('politicas');

  return (
    <div>
      <div className="cabecera-gerencia">
        <p className="kicker">Gerencia del hotel</p>
        <h2>{hotel?.nombre ?? 'Tu hotel'}</h2>
        <p className="texto-secundario">
          Personaliza tu hotel: lo que cambies aquí aplica a todo tu equipo y a las reservas nuevas.
        </p>
      </div>

      <div className="pestanas" role="tablist" aria-label="Secciones de la gerencia">
        {SECCIONES.map(({ id, titulo, icono: Icono }) => (
          <button
            key={id}
            role="tab"
            aria-selected={seccion === id}
            className={`pestana ${seccion === id ? 'activa' : ''}`}
            onClick={() => setSeccion(id)}
          >
            <Icono size={16} /> {titulo}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {seccion === 'politicas' && <PoliticasHotel />}
        {seccion === 'temporadas' && <TemporadasHotel />}
        {seccion === 'precios' && <Tarifas puedeEditar />}
        {seccion === 'consumos' && <CatalogoConsumos />}
        {seccion === 'equipo' && (
          <Usuarios gestion={api.equipo} idUsuarioActual={idUsuarioActual} />
        )}
        {seccion === 'datos' && <DatosHotel />}
      </div>
    </div>
  );
}
