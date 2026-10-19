import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { ImageUp, Palette, RotateCcw, Save, Trash2, TriangleAlert } from 'lucide-react';
import { api } from '../../api/client';
import { useHotel } from '../../contexto/HotelActual';
import { Marca } from '../../components/Marca';
import { FUENTES_TEXTO, FUENTES_TITULOS } from '../../logica/marca';
import { aplicarTema, generarTema } from '../../logica/tema';

const TIPOS_LOGO = ['image/png', 'image/jpeg', 'image/webp'];
const PESO_MAXIMO_LOGO = 200 * 1024;

// Identidad del hotel: logo, colores, tipografías y eslogan. Mientras se edita,
// toda la app muestra la vista previa; al salir sin guardar, vuelve la marca guardada.
export function MarcaHotel() {
  const { hotel, recargar } = useHotel();
  const [logo, setLogo] = useState<string | null>(hotel?.logo ?? null);
  const [colorPrimario, setColorPrimario] = useState(hotel?.colorPrimario ?? '#0f1b2d');
  const [colorAcento, setColorAcento] = useState(hotel?.colorAcento ?? '#c9a227');
  const [fuenteTitulos, setFuenteTitulos] = useState(hotel?.fuenteTitulos ?? 'Playfair Display');
  const [fuenteTexto, setFuenteTexto] = useState(hotel?.fuenteTexto ?? 'Inter');
  const [eslogan, setEslogan] = useState(hotel?.eslogan ?? '');
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Si el hotel termina de cargar después de abrir la pestaña, se rellena.
  useEffect(() => {
    if (!hotel) return;
    setLogo(hotel.logo);
    setColorPrimario(hotel.colorPrimario);
    setColorAcento(hotel.colorAcento);
    setFuenteTitulos(hotel.fuenteTitulos);
    setFuenteTexto(hotel.fuenteTexto);
    setEslogan(hotel.eslogan ?? '');
  }, [hotel]);

  const borrador = useMemo(
    () => ({ colorPrimario, colorAcento, fuenteTitulos, fuenteTexto }),
    [colorPrimario, colorAcento, fuenteTitulos, fuenteTexto],
  );
  const { avisos } = generarTema(borrador);

  // Vista previa en vivo sobre toda la app.
  useEffect(() => {
    aplicarTema(borrador);
  }, [borrador]);

  // Al salir de la pestaña, la app vuelve a la marca guardada.
  useEffect(
    () => () => {
      if (hotel) aplicarTema(hotel);
    },
    [hotel],
  );

  function elegirLogo(evento: ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0];
    evento.target.value = '';
    if (!archivo) return;
    setError(null);
    if (!TIPOS_LOGO.includes(archivo.type)) {
      setError('El logo debe ser una imagen PNG, JPG o WEBP.');
      return;
    }
    if (archivo.size > PESO_MAXIMO_LOGO) {
      setError('El logo debe pesar como máximo 200 KB.');
      return;
    }
    const lector = new FileReader();
    lector.onload = () => setLogo(String(lector.result));
    lector.readAsDataURL(archivo);
  }

  function descartar() {
    if (!hotel) return;
    setLogo(hotel.logo);
    setColorPrimario(hotel.colorPrimario);
    setColorAcento(hotel.colorAcento);
    setFuenteTitulos(hotel.fuenteTitulos);
    setFuenteTexto(hotel.fuenteTexto);
    setEslogan(hotel.eslogan ?? '');
    setAviso(null);
  }

  async function guardar() {
    setError(null);
    setAviso(null);
    setGuardando(true);
    try {
      await api.actualizarMarca({ ...borrador, eslogan: eslogan || null, logo });
      await recargar();
      setAviso('Marca guardada: todo tu equipo la verá al entrar.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la marca');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      {error && <div className="mensaje-error">{error}</div>}
      {aviso && <div className="mensaje-exito">{aviso}</div>}

      <div className="marca-gerencia">
        <section className="tarjeta">
          <h3 className="tarjeta-titulo">
            <Palette size={18} /> Identidad del hotel
          </h3>

          <div className="campo">
            <label>Logo</label>
            <div className="logo-editor">
              <div className="logo-muestra">
                {logo ? <img src={logo} alt="Logo del hotel" /> : <span>Sin logo</span>}
              </div>
              <div className="logo-acciones">
                <label className="boton-archivo">
                  <ImageUp size={16} /> {logo ? 'Cambiar logo' : 'Subir logo'}
                  <input type="file" accept={TIPOS_LOGO.join(',')} onChange={elegirLogo} />
                </label>
                {logo && (
                  <button type="button" className="enlace" onClick={() => setLogo(null)}>
                    <Trash2 size={14} /> Quitar
                  </button>
                )}
                <span className="texto-secundario">PNG, JPG o WEBP · máx. 200 KB</span>
              </div>
            </div>
          </div>

          <div className="fila-campos">
            <div className="campo">
              <label htmlFor="marca-primario">Color principal</label>
              <input
                id="marca-primario"
                type="color"
                value={colorPrimario}
                onChange={(e) => setColorPrimario(e.target.value)}
              />
            </div>
            <div className="campo">
              <label htmlFor="marca-acento">Color de acento</label>
              <input
                id="marca-acento"
                type="color"
                value={colorAcento}
                onChange={(e) => setColorAcento(e.target.value)}
              />
            </div>
          </div>
          {avisos.map((a) => (
            <div key={a} className="mensaje-aviso">
              <TriangleAlert size={14} /> {a}
            </div>
          ))}

          <div className="fila-campos">
            <div className="campo crece">
              <label htmlFor="marca-titulos">Tipografía de títulos</label>
              <select
                id="marca-titulos"
                value={fuenteTitulos}
                onChange={(e) => setFuenteTitulos(e.target.value)}
              >
                {FUENTES_TITULOS.map((f) => (
                  <option key={f} style={{ fontFamily: f }}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div className="campo crece">
              <label htmlFor="marca-texto">Tipografía del texto</label>
              <select
                id="marca-texto"
                value={fuenteTexto}
                onChange={(e) => setFuenteTexto(e.target.value)}
              >
                {FUENTES_TEXTO.map((f) => (
                  <option key={f} style={{ fontFamily: f }}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="campo">
            <label htmlFor="marca-eslogan">Eslogan</label>
            <input
              id="marca-eslogan"
              value={eslogan}
              maxLength={80}
              placeholder="p. ej. Frente al mar de Cartagena"
              onChange={(e) => setEslogan(e.target.value)}
            />
          </div>

          <div className="acciones-formulario">
            <button type="button" className="secundario" onClick={descartar}>
              <RotateCcw size={16} /> Descartar cambios
            </button>
            <button type="button" className="acento" onClick={guardar} disabled={guardando}>
              <Save size={16} /> {guardando ? 'Guardando...' : 'Guardar marca'}
            </button>
          </div>
        </section>

        <section className="tarjeta vista-previa-gerencia" aria-label="Vista previa">
          <h3 className="tarjeta-titulo">Vista previa</h3>
          <p className="texto-secundario">
            Toda la app ya muestra estos cambios mientras editas. Así se ve el menú:
          </p>
          <div className="previa-menu">
            <Marca
              nombre={hotel?.nombre ?? 'Tu hotel'}
              subtitulo={eslogan || 'Lazaro Software'}
              logo={logo}
            />
            <div className="previa-item activo">Hoy</div>
            <div className="previa-item">Reservas</div>
          </div>
          <div className="previa-botones">
            <button type="button" className="acento">
              Confirmar reserva
            </button>
            <button type="button" className="primario">
              Check-in
            </button>
          </div>
          <h2 className="previa-titulo">Resumen del día</h2>
        </section>
      </div>
    </div>
  );
}
