import { useEffect, useState } from 'react';
import { EVENTO_SESION_VENCIDA, guardarSesion, leerSesion, usarToken } from './api/client';
import type { Permiso, Sesion } from './api/types';
import { ETIQUETA_ROL } from './formato';
import { Login } from './pages/Login';
import { TableroHabitaciones } from './pages/TableroHabitaciones';
import { NuevaReserva } from './pages/NuevaReserva';
import { Reservas } from './pages/Reservas';
import { Usuarios } from './pages/Usuarios';
import { Huespedes } from './pages/Huespedes';
import { PanelHoy } from './pages/PanelHoy';
import { Calendario } from './pages/Calendario';
import { Tarifas } from './pages/Tarifas';
import { ModalCambiarContrasena } from './components/ModalCambiarContrasena';

type Pestana =
  | 'hoy'
  | 'calendario'
  | 'tablero'
  | 'tarifas'
  | 'nueva-reserva'
  | 'reservas'
  | 'huespedes'
  | 'usuarios';

// Cada pestaña se muestra solo si el rol tiene el permiso que la respalda.
// (El backend vuelve a verificar cada acción: ocultar no es la protección real.)
const PESTANAS: { id: Pestana; titulo: string; permiso: Permiso }[] = [
  { id: 'hoy', titulo: 'Hoy', permiso: 'reservas:ver' },
  { id: 'calendario', titulo: 'Calendario', permiso: 'reservas:ver' },
  { id: 'tablero', titulo: 'Habitaciones', permiso: 'habitaciones:ver' },
  { id: 'tarifas', titulo: 'Tarifas', permiso: 'habitaciones:ver' },
  { id: 'nueva-reserva', titulo: 'Nueva reserva', permiso: 'reservas:gestionar' },
  { id: 'reservas', titulo: 'Reservas', permiso: 'reservas:ver' },
  { id: 'huespedes', titulo: 'Huéspedes', permiso: 'reservas:ver' },
  { id: 'usuarios', titulo: 'Usuarios', permiso: 'usuarios:gestionar' },
];

export default function App() {
  const [sesion, setSesion] = useState<Sesion | null>(leerSesion);
  const [pestana, setPestana] = useState<Pestana>('hoy');
  const [avisoLogin, setAvisoLogin] = useState<string | null>(null);
  const [cambiandoContrasena, setCambiandoContrasena] = useState(false);

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
  const puede = (permiso: Permiso) => usuario.permisos.includes(permiso);
  const visibles = PESTANAS.filter((p) => puede(p.permiso));

  return (
    <div>
      <header className="encabezado">
        <div>
          <h1>MVP Hotel</h1>
          <p className="subtitulo">Gestión básica de habitaciones y reservas</p>
        </div>
        <div className="usuario-sesion">
          <div>
            <strong>{usuario.nombre}</strong>
            <div className="texto-secundario">{ETIQUETA_ROL[usuario.rol]}</div>
          </div>
          <button className="secundario" onClick={() => setCambiandoContrasena(true)}>
            Mi contraseña
          </button>
          <button className="secundario" onClick={() => abrirSesion(null)}>
            Salir
          </button>
        </div>
      </header>

      <nav className="tabs">
        {visibles.map((p) => (
          <button
            key={p.id}
            className={pestana === p.id ? 'activo' : ''}
            onClick={() => setPestana(p.id)}
          >
            {p.titulo}
          </button>
        ))}
      </nav>

      {pestana === 'hoy' && <PanelHoy puedeOperar={puede('estadias:gestionar')} />}
      {pestana === 'calendario' && <Calendario />}
      {pestana === 'tarifas' && <Tarifas puedeEditar={puede('habitaciones:gestionar')} />}
      {pestana === 'tablero' && (
        <TableroHabitaciones puedeCrear={puede('habitaciones:gestionar')} />
      )}
      {pestana === 'nueva-reserva' && <NuevaReserva />}
      {pestana === 'reservas' && <Reservas puedeCargar={puede('folio:gestionar')} />}
      {pestana === 'huespedes' && <Huespedes />}
      {pestana === 'usuarios' && puede('usuarios:gestionar') && (
        <Usuarios idUsuarioActual={usuario.id} />
      )}

      {cambiandoContrasena && (
        <ModalCambiarContrasena onCerrar={() => setCambiandoContrasena(false)} />
      )}
    </div>
  );
}
