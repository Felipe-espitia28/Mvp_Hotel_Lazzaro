import { useCallback, useEffect, useState } from 'react';
import { Building2, KeyRound, LogOut, Menu } from 'lucide-react';
import { api } from '../../api/client';
import type { HotelResumen, UsuarioSesion } from '../../api/types';
import { Marca, iniciales } from '../../components/Marca';
import { ETIQUETA_ROL } from '../../formato';
import { ListaHoteles } from './ListaHoteles';
import { DetalleHotel } from './DetalleHotel';
import { NuevoHotel } from './NuevoHotel';

type Vista = { tipo: 'lista' } | { tipo: 'nuevo' } | { tipo: 'detalle'; hotel: HotelResumen };

interface Props {
  usuario: UsuarioSesion;
  onSalir: () => void;
  onCambiarContrasena: () => void;
}

// Consola Lazaro: el panel del equipo de Lazaro. Da de alta los hoteles que
// compran el módulo y el acceso de su gente; no opera las reservas de nadie.
export function Consola({ usuario, onSalir, onCambiarContrasena }: Props) {
  const [hoteles, setHoteles] = useState<HotelResumen[]>([]);
  const [vista, setVista] = useState<Vista>({ tipo: 'lista' });
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menuAbierto, setMenuAbierto] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setHoteles(await api.plataforma.hoteles());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar los hoteles');
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function irALista() {
    setVista({ tipo: 'lista' });
    setMenuAbierto(false);
    cargar();
  }

  return (
    <div className="app">
      {menuAbierto && <div className="velo-menu" onClick={() => setMenuAbierto(false)} />}

      <aside className={`barra-lateral ${menuAbierto ? 'abierta' : ''}`}>
        <Marca nombre="Consola Lazaro" subtitulo="Módulo hotelero" />
        <nav className="navegacion" aria-label="Secciones">
          <div className="nav-grupo">
            <div className="nav-grupo-titulo">Plataforma</div>
            <button className="nav-item activo" aria-current="page" onClick={irALista}>
              <Building2 size={18} strokeWidth={1.8} />
              Hoteles
            </button>
          </div>
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
            <button onClick={onCambiarContrasena}>
              <KeyRound size={14} /> Contraseña
            </button>
            <button onClick={onSalir}>
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
            Consola de la plataforma · <strong>{usuario.nombre}</strong>
          </div>
        </header>

        <main className="pagina">
          {error && <div className="mensaje-error">{error}</div>}
          {aviso && <div className="mensaje-exito">{aviso}</div>}

          {vista.tipo === 'lista' && (
            <ListaHoteles
              hoteles={hoteles}
              onAbrir={(hotel) => {
                setAviso(null);
                setVista({ tipo: 'detalle', hotel });
              }}
              onNuevo={() => {
                setAviso(null);
                setVista({ tipo: 'nuevo' });
              }}
            />
          )}
          {vista.tipo === 'nuevo' && (
            <NuevoHotel
              onCancelar={irALista}
              onCreado={(hotel) => {
                setAviso(
                  `${hotel.nombre} quedó creado: su equipo ya puede entrar y su administrador personalizarlo en la Gerencia.`,
                );
                setVista({ tipo: 'detalle', hotel });
                cargar();
              }}
            />
          )}
          {vista.tipo === 'detalle' && (
            <DetalleHotel
              hotel={vista.hotel}
              onVolver={irALista}
              onCambio={(hotel) => setVista({ tipo: 'detalle', hotel })}
            />
          )}
        </main>
      </div>
    </div>
  );
}
