import { useState } from 'react';
import {
  Banknote,
  Building2,
  CalendarRange,
  FileLock,
  Palette,
  Scale,
  ShoppingBag,
  Tags,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../../api/client';
import { useHotel } from '../../contexto/HotelActual';
import { Tarifas } from '../Tarifas';
import { Usuarios } from '../Usuarios';
import { DatosHotel } from './DatosHotel';
import { PoliticasHotel } from './PoliticasHotel';
import { TemporadasHotel } from './TemporadasHotel';
import { RecursosYSalidas } from './RecursosYSalidas';
import { CatalogoServicios } from './CatalogoServicios';
import { MarcaHotel } from './MarcaHotel';
import { PoliticaDatos } from './PoliticaDatos';
import { CuentasPorCobrar } from './CuentasPorCobrar';
import { Caja } from './Caja';

type Seccion =
  | 'marca'
  | 'politicas'
  | 'temporadas'
  | 'precios'
  | 'servicios'
  | 'equipo'
  | 'datos'
  | 'datosPersonales'
  | 'cobros'
  | 'caja';

const SECCIONES: { id: Seccion; titulo: string; icono: LucideIcon }[] = [
  { id: 'marca', titulo: 'Marca', icono: Palette },
  { id: 'politicas', titulo: 'Políticas', icono: Scale },
  { id: 'temporadas', titulo: 'Temporadas', icono: CalendarRange },
  { id: 'precios', titulo: 'Precios y habitaciones', icono: Tags },
  { id: 'servicios', titulo: 'Servicios', icono: ShoppingBag },
  { id: 'equipo', titulo: 'Equipo', icono: Users },
  { id: 'datos', titulo: 'Datos del hotel', icono: Building2 },
  { id: 'datosPersonales', titulo: 'Datos personales', icono: FileLock },
  { id: 'cobros', titulo: 'Cuentas por cobrar', icono: Wallet },
  { id: 'caja', titulo: 'Caja', icono: Banknote },
];

interface Props {
  idUsuarioActual: string;
}

// Gerencia del hotel: el panel del administrador para personalizar SU hotel.
// Lo que cambia aquí aplica a todo su equipo; la operación diaria (reservas,
// check-in, folio) sigue en las demás pantallas.
export function Gerencia({ idUsuarioActual }: Props) {
  const { hotel } = useHotel();
  const [seccion, setSeccion] = useState<Seccion>('marca');

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
        {seccion === 'marca' && <MarcaHotel />}
        {seccion === 'politicas' && <PoliticasHotel />}
        {seccion === 'temporadas' && <TemporadasHotel />}
        {seccion === 'precios' && <Tarifas puedeEditar />}
        {seccion === 'servicios' && (
          <>
            <CatalogoServicios />
            <RecursosYSalidas />
          </>
        )}
        {seccion === 'equipo' && (
          <Usuarios gestion={api.equipo} idUsuarioActual={idUsuarioActual} />
        )}
        {seccion === 'datos' && <DatosHotel />}
        {seccion === 'datosPersonales' && <PoliticaDatos />}
        {seccion === 'cobros' && <CuentasPorCobrar />}
        {seccion === 'caja' && <Caja />}
      </div>
    </div>
  );
}
