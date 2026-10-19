import { useEffect, useState, type FormEvent } from 'react';
import { CalendarCheck, LogIn, Receipt, ShieldCheck } from 'lucide-react';
import { api } from '../api/client';
import type { MarcaHotel, Sesion } from '../api/types';
import { Marca } from '../components/Marca';
import { aplicarTema } from '../logica/tema';

// Ingreso con la marca de un hotel: /?hotel=sol-caribe
const slugDeLaDireccion = () => new URLSearchParams(window.location.search).get('hotel');

interface Props {
  onIngreso: (sesion: Sesion) => void;
  aviso?: string | null;
}

export function Login({ onIngreso, aviso }: Props) {
  const [email, setEmail] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [marca, setMarca] = useState<MarcaHotel | null>(null);

  useEffect(() => {
    const slug = slugDeLaDireccion();
    if (!slug) {
      aplicarTema(null);
      return;
    }
    api
      .marcaPublica(slug)
      .then((encontrada) => {
        setMarca(encontrada);
        aplicarTema(encontrada);
      })
      .catch(() => aplicarTema(null)); // Hotel desconocido: ingreso con la marca de Lazaro.
  }, []);

  async function ingresar(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      onIngreso(await api.login(email, contrasena));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar sesión');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="pantalla-login">
      <section className="login-marca">
        {marca ? (
          <Marca
            nombre={marca.nombre}
            subtitulo={marca.eslogan || 'Lazaro Software'}
            logo={marca.logo}
          />
        ) : (
          <Marca />
        )}
        <div>
          {marca ? (
            <h1>
              Bienvenido a <span>{marca.nombre}</span>
            </h1>
          ) : (
            <h1>
              Tu hotel, <span>sin sobreventas</span> y con cada noche bien cobrada.
            </h1>
          )}
          <p>
            Módulo hotelero para Lazaro Software: reservas por fechas, tarifas por temporada y la
            cuenta completa de cada estadía.
          </p>
          <ul className="login-puntos">
            <li>
              <ShieldCheck size={20} /> Una habitación nunca se vende dos veces
            </li>
            <li>
              <CalendarCheck size={20} /> Temporadas y festivos de Colombia calculados solos
            </li>
            <li>
              <Receipt size={20} /> Consumos cargados al folio y liquidados en el check-out
            </li>
          </ul>
        </div>
        <div className="login-pie">
          {marca ? 'Con la tecnología de Lazaro Software' : 'MVP · Diseño de Soluciones 2026'}
        </div>
      </section>

      <section className="login-formulario">
        <form className="tarjeta-login" onSubmit={ingresar}>
          <h2>Bienvenido</h2>
          <p className="subtitulo">
            Ingresa con tu usuario {marca ? `de ${marca.nombre}` : 'del hotel'}.
          </p>
          {aviso && !error && <div className="mensaje-aviso">{aviso}</div>}
          {error && <div className="mensaje-error">{error}</div>}
          <div className="campo">
            <label htmlFor="email">Correo</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              placeholder="nombre@hotel.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="campo">
            <label htmlFor="contrasena">Contraseña</label>
            <input
              id="contrasena"
              type="password"
              autoComplete="current-password"
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="acento ancho-completo" disabled={enviando}>
            <LogIn size={17} />
            {enviando ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </section>
    </div>
  );
}
