import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BedDouble,
  CalendarDays,
  CalendarPlus,
  ClipboardList,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { EVENTO_SESION_VENCIDA, api, guardarSesion, leerSesion, usarToken } from './api/client';
import type { Hotel, Permiso, Sesion } from './api/types';
import { ETIQUETA_ROL } from './formato';
import { Login } from './pages/Login';
import { TableroHabitaciones } from './pages/TableroHabitaciones';
import { NuevaReserva } from './pages/NuevaReserva';
import { Reservas } from './pages/Reservas';
import { Huespedes } from './pages/Huespedes';
import { PanelHoy } from './pages/PanelHoy';
import { Calendario } from './pages/Calendario';
import { Gerencia } from './pages/gerencia/Gerencia';
import { Consola } from './pages/consola/Consola';
import { ModalCambiarContrasena } from './components/ModalCambiarContrasena';
import { Marca, iniciales } from './components/Marca';
import { HotelContexto } from './contexto/HotelActual';
import { aplicarTema } from './logica/tema';

type Pestana =
  'hoy' | 'calendario' | 'tablero' | 'nueva-reserva' | 'reservas' | 'huespedes' | 'gerencia';

type Grupo = 'Operación' | 'Hotel' | 'Gerencia';

// Cada pestaña se muestra solo si el rol tiene el permiso que la respalda.
// (El backend vuelve a verificar cada acción: ocultar no es la protección real.)
const PESTANAS: {
  id: Pestana;
  titulo: string;
  permiso: Permiso;
  icono: LucideIcon;
  grupo: Grupo;
}[] = [
  { id: 'hoy', titulo: 'Hoy', permiso: 'reservas:ver', icono: LayoutDashboard, grupo: 'Operación' },
  {
    id: 'calendario',
    titulo: 'Calendario',
    permiso: 'reservas:ver',
    icono: CalendarDays,
    grupo: 'Operación',
  },
  {
    id: 'reservas',
    titulo: 'Reservas',
    permiso: 'reservas:ver',
    icono: ClipboardList,
    grupo: 'Operación',
  },
  {
    id: 'nueva-reserva',
    titulo: 'Nueva reserva',
    permiso: 'reservas:gestionar',
    icono: CalendarPlus,
    grupo: 'Operación',
  },
  {
    id: 'huespedes',
    titulo: 'Huéspedes',
    permiso: 'reservas:ver',
    icono: Users,
    grupo: 'Operación',
  },
  {
    id: 'tablero',
    titulo: 'Habitaciones',
    permiso: 'habitaciones:ver',
    icono: BedDouble,
    grupo: 'Hotel',
  },
  // El panel del administrador para personalizar su hotel (marca, reglas,
  // precios, equipo). Recepción no lo ve.
  {
    id: 'gerencia',
    titulo: 'Gerencia del hotel',
    permiso: 'hotel:configurar',
    icono: Settings,
    grupo: 'Gerencia',
  },
];

const GRUPOS: Grupo[] = ['Operación', 'Hotel', 'Gerencia'];

function saludo() {
  const hora = new Date().getHours();
  return hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
}

export default function App() {
  const [sesion, setSesion] = useState<Sesion | null>(leerSesion);
  const [pestana, setPestana] = useState<Pestana>('hoy');
  const [buscarEnReservas, setBuscarEnReservas] = useState<string | undefined>(undefined);
  const [avisoLogin, setAvisoLogin] = useState<string | null>(null);
  const [cambiandoContrasena, setCambiandoContrasena] = useState(false);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [hotel, setHotel] = useState<Hotel | null>(null);

  function abrirSesion(nueva: Sesion | null) {
    usarToken(nueva?.token ?? null);
    guardarSesion(nueva);
    setSesion(nueva);
    setPestana('hoy');
  }

  // Si el backend rechaza la sesión (venció o desactivaron al usuario), vuelve al login.
  useEffect(() => {
    const alVencer = (evento: Event) => {
      setAvisoLogin(`${(evento as CustomEvent<string>).detail}. Vuelve a ingresar.`);
      abrirSesion(null);
    };
    window.addEventListener(EVENTO_SESION_VENCIDA, alVencer);
    return () => window.removeEventListener(EVENTO_SESION_VENCIDA, alVencer);
  }, []);

  // Los permisos guardados al iniciar sesión pueden quedar viejos (cambio de
  // rol, permisos nuevos): al abrir la app se piden de nuevo al backend.
  const token = sesion?.token;
  useEffect(() => {
    if (!token) return;
    api
      .yo()
      .then((usuario) => {
        const actualizada = { token, usuario };
        guardarSesion(actualizada);
        setSesion(actualizada);
      })
      .catch(() => {
        // Si la sesión ya no sirve, el evento de sesión vencida lleva al login.
      });
  }, [token]);

  // El hotel de quien entra (su marca, datos y reglas). El equipo de Lazaro no
  // tiene hotel: usa la Consola.
  const hotelId = sesion?.usuario.hotelId;
  const cargarHotel = useCallback(async () => {
    if (!hotelId) {
      setHotel(null);
      return;
    }
    try {
      setHotel(await api.hotel());
    } catch {
      // Si la sesión ya no sirve, el evento de sesión vencida lleva al login.
    }
  }, [hotelId]);

  useEffect(() => {
    cargarHotel();
  }, [cargarHotel]);

  const valorHotel = useMemo(() => ({ hotel, recargar: cargarHotel }), [hotel, cargarHotel]);

  // La app se viste con la marca del hotel (colores y tipografías); la Consola
  // usa la de Lazaro.
  const esPlataforma = sesion?.usuario.rol === 'plataforma';
  useEffect(() => {
    if (esPlataforma) aplicarTema(null);
    else if (hotel) aplicarTema(hotel);
  }, [esPlataforma, hotel]);

  if (!sesion) {
    return (
      <Login
        aviso={avisoLogin}
        onIngreso={(nueva) => {
          setAvisoLogin(null);
          abrirSesion(nueva);
        }}
      />
    );
  }

  const { usuario } = sesion;

  if (usuario.rol === 'plataforma') {
    return (
      <>
        <Consola
          usuario={usuario}
          onSalir={() => abrirSesion(null)}
          onCambiarContrasena={() => setCambiandoContrasena(true)}
        />
        {cambiandoContrasena && (
          <ModalCambiarContrasena onCerrar={() => setCambiandoContrasena(false)} />
        )}
      </>
    );
  }

  const puede = (permiso: Permiso) => usuario.permisos.includes(permiso);
  const visibles = PESTANAS.filter((p) => puede(p.permiso));
  const fechaLarga = new Date().toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  // "lunes, 12 de octubre de 2026" → "Lunes, 12 de octubre de 2026"
  const hoy = fechaLarga.charAt(0).toUpperCase() + fechaLarga.slice(1);

  function irA(id: Pestana) {
    setPestana(id);
    setBuscarEnReservas(undefined);
    setMenuAbierto(false);
  }

  // A-6: desde "Datos por completar", abre Reservas buscando al titular.
  function verReserva(documento: string) {
    setBuscarEnReservas(documento);
    setPestana('reservas');
  }

  return (
    <HotelContexto.Provider value={valorHotel}>
      <div className="app">
        {menuAbierto && <div className="velo-menu" onClick={() => setMenuAbierto(false)} />}

        <aside className={`barra-lateral ${menuAbierto ? 'abierta' : ''}`}>
          <Marca
            nombre={hotel?.nombre ?? 'MVP Hotel'}
            subtitulo={hotel?.eslogan || 'Lazaro Software'}
            logo={hotel?.logo}
          />

          <nav className="navegacion" aria-label="Secciones">
            {GRUPOS.map((grupo) => {
              const items = visibles.filter((p) => p.grupo === grupo);
              if (items.length === 0) return null;
              return (
                <div key={grupo} className="nav-grupo">
                  <div className="nav-grupo-titulo">{grupo}</div>
                  {items.map(({ id, titulo, icono: Icono }) => (
                    <button
                      key={id}
                      className={`nav-item ${pestana === id ? 'activo' : ''}`}
                      aria-current={pestana === id ? 'page' : undefined}
                      onClick={() => irA(id)}
                    >
                      <Icono size={18} strokeWidth={1.8} />
                      {titulo}
                    </button>
                  ))}
                </div>
              );
            })}
          </nav>

          <div className="tarjeta-usuario">
            <div className="tarjeta-usuario-cabecera">
              <div className="avatar">{iniciales(usuario.nombre)}</div>
              <div>
                <div className="tarjeta-usuario-nombre">{usuario.nombre}</div>
                <div className="tarjeta-usuario-rol">{ETIQUETA_ROL[usuario.rol]}</div>
              </div>
            </div>
            <div className="tarjeta-usuario-acciones">
              <button onClick={() => setCambiandoContrasena(true)}>
                <KeyRound size={14} /> Contraseña
              </button>
              <button onClick={() => abrirSesion(null)}>
                <LogOut size={14} /> Salir
              </button>
            </div>
          </div>
        </aside>

        <div className="contenido">
          <header className="barra-superior">
            <button
              className="boton-menu"
              aria-label="Abrir menú"
              onClick={() => setMenuAbierto(true)}
            >
              <Menu size={20} />
            </button>
            <div className="barra-superior-saludo">
              {saludo()}, <strong>{usuario.nombre}</strong>
            </div>
            <div className="barra-superior-fecha">
              <CalendarDays size={15} />
              {hoy}
            </div>
          </header>

          <main className="pagina">
            {pestana === 'hoy' && (
              <PanelHoy
                puedeOperar={puede('estadias:gestionar')}
                puedeCerrarConSaldo={puede('cuentas:por-cobrar')}
                puedeVerGerencia={puede('panel:gerencia')}
                onVerReserva={verReserva}
              />
            )}
            {pestana === 'calendario' && (
              <Calendario
                puedeModificar={puede('reservas:gestionar')}
                esAdmin={puede('hotel:configurar')}
              />
            )}
            {pestana === 'tablero' && (
              <TableroHabitaciones
                puedeCrear={puede('habitaciones:gestionar')}
                puedeCambiarEstado={puede('habitaciones:estado')}
              />
            )}
            {pestana === 'nueva-reserva' && <NuevaReserva />}
            {pestana === 'reservas' && (
              <Reservas
                puedeCargar={puede('folio:gestionar')}
                puedeAnularPagos={puede('pagos:anular')}
                puedeCerrarConSaldo={puede('cuentas:por-cobrar')}
                puedeModificar={puede('reservas:gestionar')}
                esAdmin={puede('hotel:configurar')}
                buscarInicial={buscarEnReservas}
              />
            )}
            {pestana === 'huespedes' && (
              <Huespedes puedeReportar={puede('reportes-legales:ver')} onVerReserva={verReserva} />
            )}
            {pestana === 'gerencia' && puede('hotel:configurar') && (
              <Gerencia idUsuarioActual={usuario.id} />
            )}
          </main>
        </div>

        {cambiandoContrasena && (
          <ModalCambiarContrasena onCerrar={() => setCambiandoContrasena(false)} />
        )}
      </div>
    </HotelContexto.Provider>
  );
}
