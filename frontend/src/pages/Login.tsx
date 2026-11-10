import { useEffect, useState, type FormEvent } from 'react';
import { LogIn } from 'lucide-react';
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

  // Plan 18 (R73): "¿Olvidaste tu contraseña?". La respuesta es la misma
  // exista o no el correo: no revela quién tiene cuenta.
  const [recuperando, setRecuperando] = useState(false);
  const [enlaceEnviado, setEnlaceEnviado] = useState(false);

  async function recuperar(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await api.recuperar(email);
      setEnlaceEnviado(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar el enlace');
    } finally {
      setEnviando(false);
    }
  }

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
        <div className="login-contenido">
          <div>
            <h1>{marca ? `Bienvenido a ${marca.nombre}` : 'Reservas y estadías del hotel'}</h1>
            <p>
              Disponibilidad, tarifas por temporada, check-in y check-out, y la cuenta de cada
              estadía, en un solo lugar.
            </p>
          </div>
          <div className="login-foto-marco">
            <img className="login-foto" src="/login-fondo.jpg" alt="" />
          </div>
        </div>
        <div className="login-pie">
          {marca ? 'Con la tecnología de Lazaro Software' : 'MVP · Diseño de Soluciones 2026'}
        </div>
      </section>

      <section className="login-formulario">
        {recuperando ? (
          <form className="tarjeta-login" onSubmit={recuperar}>
            <h2>¿Olvidaste tu contraseña?</h2>
            <p className="subtitulo">
              Escribe tu correo y te enviaremos un enlace para crear una nueva.
            </p>
            {error && <div className="mensaje-error">{error}</div>}
            {enlaceEnviado ? (
              <div className="mensaje-exito">
                Si el correo está registrado, te llegará un enlace. Vence en 30 minutos.
              </div>
            ) : (
              <>
                <div className="campo">
                  <label htmlFor="email-recuperar">Correo</label>
                  <input
                    id="email-recuperar"
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="acento ancho-completo boton-ingreso"
                  disabled={enviando}
                >
                  {enviando ? 'Enviando...' : 'Enviar enlace'}
                </button>
              </>
            )}
            <button
              type="button"
              className="enlace"
              onClick={() => {
                setRecuperando(false);
                setEnlaceEnviado(false);
                setError(null);
              }}
            >
              Volver a iniciar sesión
            </button>
          </form>
        ) : (
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
            <button
              type="submit"
              className="acento ancho-completo boton-ingreso"
              disabled={enviando}
            >
              <LogIn size={17} />
              {enviando ? 'Ingresando...' : 'Ingresar'}
            </button>
            <button
              type="button"
              className="enlace"
              onClick={() => {
                setRecuperando(true);
                setError(null);
              }}
            >
              ¿Olvidaste tu contraseña?
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
