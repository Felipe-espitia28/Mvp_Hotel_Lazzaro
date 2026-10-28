import { useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, Plus, Trash2 } from 'lucide-react';
import { api, type NuevoUsuario } from '../../api/client';
import type { HotelResumen, RolDeHotel } from '../../api/types';
import { FUENTES_TEXTO, FUENTES_TITULOS, MARCA_LAZARO, aSlug } from '../../logica/marca';

const PASOS = ['Datos del hotel', 'Marca', 'Personas con acceso'];

const personaVacia = (rol: RolDeHotel): NuevoUsuario => ({
  nombre: '',
  email: '',
  contrasena: '',
  rol,
});

interface Props {
  onCancelar: () => void;
  onCreado: (hotel: HotelResumen) => void;
}

// Alta de un hotel que compró el módulo: sus datos, su marca inicial y las
// personas que tendrán acceso. El hotel nace con tipos de habitación y
// políticas sugeridas, que su administrador ajusta luego en la Gerencia.
export function NuevoHotel({ onCancelar, onCreado }: Props) {
  const [paso, setPaso] = useState(0);
  const [nombre, setNombre] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEditado, setSlugEditado] = useState(false);
  const [ciudad, setCiudad] = useState('');
  const [nit, setNit] = useState('');
  const [telefono, setTelefono] = useState('');
  const [eslogan, setEslogan] = useState('');
  const [colorPrimario, setColorPrimario] = useState(MARCA_LAZARO.colorPrimario);
  const [colorAcento, setColorAcento] = useState(MARCA_LAZARO.colorAcento);
  const [fuenteTitulos, setFuenteTitulos] = useState(MARCA_LAZARO.fuenteTitulos);
  const [fuenteTexto, setFuenteTexto] = useState(MARCA_LAZARO.fuenteTexto);
  const [personas, setPersonas] = useState<NuevoUsuario[]>([
    personaVacia('admin'),
    personaVacia('recepcionista'),
  ]);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const cambiarPersona = (i: number, cambios: Partial<NuevoUsuario>) =>
    setPersonas(personas.map((p, j) => (j === i ? { ...p, ...cambios } : p)));

  function siguiente(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    setPaso(paso + 1);
  }

  async function crear(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    if (!personas.some((p) => p.rol === 'admin')) {
      setError('Agrega al menos un administrador: es quien maneja la Gerencia del hotel.');
      return;
    }
    setEnviando(true);
    try {
      const hotel = await api.plataforma.crearHotel({
        nombre,
        slug,
        ciudad: ciudad || undefined,
        nit: nit || undefined,
        telefono: telefono || undefined,
        eslogan: eslogan || undefined,
        colorPrimario,
        colorAcento,
        fuenteTitulos,
        fuenteTexto,
        personas,
      });
      onCreado({
        ...hotel,
        habitaciones: 0,
        usuarios: personas.length,
        ocupadasEstaNoche: 0,
        reservasDelMes: 0,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear el hotel');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div>
      <button className="enlace" onClick={onCancelar}>
        <ArrowLeft size={14} /> Todos los hoteles
      </button>
      <div className="barra-titulo" style={{ marginTop: 12 }}>
        <h2>Nuevo hotel</h2>
      </div>

      <ol className="pasos" aria-label="Pasos del alta">
        {PASOS.map((titulo, i) => (
          <li
            key={titulo}
            className={`paso ${i === paso ? 'actual' : i < paso ? 'hecho' : ''}`}
            aria-current={i === paso ? 'step' : undefined}
          >
            <span className="paso-numero">{i < paso ? <Check size={13} /> : i + 1}</span>
            {titulo}
          </li>
        ))}
      </ol>

      {error && <div className="mensaje-error">{error}</div>}

      {paso === 0 && (
        <form className="tarjeta formulario-gerencia" onSubmit={siguiente}>
          <div className="campo">
            <label htmlFor="nh-nombre">Nombre del hotel</label>
            <input
              id="nh-nombre"
              value={nombre}
              required
              maxLength={80}
              onChange={(e) => {
                setNombre(e.target.value);
                if (!slugEditado) setSlug(aSlug(e.target.value));
              }}
            />
          </div>
          <div className="campo">
            <label htmlFor="nh-slug">Identificador</label>
            <input
              id="nh-slug"
              value={slug}
              required
              maxLength={40}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              title="Minúsculas, números y guiones"
              onChange={(e) => {
                setSlugEditado(true);
                setSlug(e.target.value);
              }}
            />
            <span className="texto-secundario">
              Va en la dirección de su ingreso: …/?hotel={slug || 'identificador'}
            </span>
          </div>
          <div className="fila-campos">
            <div className="campo crece">
              <label htmlFor="nh-ciudad">Ciudad</label>
              <input id="nh-ciudad" value={ciudad} onChange={(e) => setCiudad(e.target.value)} />
            </div>
            <div className="campo crece">
              <label htmlFor="nh-nit">NIT</label>
              <input id="nh-nit" value={nit} onChange={(e) => setNit(e.target.value)} />
            </div>
            <div className="campo crece">
              <label htmlFor="nh-telefono">Teléfono</label>
              <input
                id="nh-telefono"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
              />
            </div>
          </div>
          <div className="acciones-formulario">
            <button className="primario">
              Continuar <ArrowRight size={16} />
            </button>
          </div>
        </form>
      )}

      {paso === 1 && (
        <form className="tarjeta formulario-gerencia" onSubmit={siguiente}>
          <div className="marca-editor">
            <div>
              <div className="fila-campos">
                <div className="campo">
                  <label htmlFor="nh-primario">Color principal</label>
                  <input
                    id="nh-primario"
                    type="color"
                    value={colorPrimario}
                    onChange={(e) => setColorPrimario(e.target.value)}
                  />
                </div>
                <div className="campo">
                  <label htmlFor="nh-acento">Color de acento</label>
                  <input
                    id="nh-acento"
                    type="color"
                    value={colorAcento}
                    onChange={(e) => setColorAcento(e.target.value)}
                  />
                </div>
              </div>
              <div className="fila-campos">
                <div className="campo crece">
                  <label htmlFor="nh-fuente-titulos">Tipografía de títulos</label>
                  <select
                    id="nh-fuente-titulos"
                    value={fuenteTitulos}
                    onChange={(e) => setFuenteTitulos(e.target.value)}
                  >
                    {FUENTES_TITULOS.map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                </div>
                <div className="campo crece">
                  <label htmlFor="nh-fuente-texto">Tipografía del texto</label>
                  <select
                    id="nh-fuente-texto"
                    value={fuenteTexto}
                    onChange={(e) => setFuenteTexto(e.target.value)}
                  >
                    {FUENTES_TEXTO.map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="campo">
                <label htmlFor="nh-eslogan">Eslogan (opcional)</label>
                <input
                  id="nh-eslogan"
                  value={eslogan}
                  maxLength={80}
                  onChange={(e) => setEslogan(e.target.value)}
                />
              </div>
              <p className="texto-secundario">
                El administrador del hotel puede cambiar todo esto (y subir su logo) desde su
                Gerencia.
              </p>
            </div>
            <div
              className="vista-previa-marca"
              style={{ background: colorPrimario, fontFamily: `'${fuenteTexto}', sans-serif` }}
              aria-label="Vista previa de la marca"
            >
              <span className="vista-previa-rombo" style={{ background: colorAcento }} />
              <strong style={{ fontFamily: `'${fuenteTitulos}', serif` }}>
                {nombre || 'Nombre del hotel'}
              </strong>
              <span style={{ color: colorAcento }}>{eslogan || 'Lazaro Software'}</span>
              <span className="vista-previa-boton" style={{ background: colorAcento }}>
                Ingresar
              </span>
            </div>
          </div>
          <div className="acciones-formulario">
            <button type="button" className="secundario" onClick={() => setPaso(0)}>
              <ArrowLeft size={16} /> Atrás
            </button>
            <button className="primario">
              Continuar <ArrowRight size={16} />
            </button>
          </div>
        </form>
      )}

      {paso === 2 && (
        <form className="tarjeta formulario-gerencia" onSubmit={crear}>
          <p className="texto-secundario">
            Estas personas podrán entrar al hotel desde el primer día. Al menos una debe ser
            administradora: es quien maneja la Gerencia.
          </p>
          {personas.map((p, i) => (
            <div key={i} className="fila-persona">
              <div className="campo crece">
                <label htmlFor={`p-nombre-${i}`}>Nombre</label>
                <input
                  id={`p-nombre-${i}`}
                  value={p.nombre}
                  required
                  onChange={(e) => cambiarPersona(i, { nombre: e.target.value })}
                />
              </div>
              <div className="campo crece">
                <label htmlFor={`p-email-${i}`}>Correo</label>
                <input
                  id={`p-email-${i}`}
                  type="email"
                  value={p.email}
                  required
                  onChange={(e) => cambiarPersona(i, { email: e.target.value })}
                />
              </div>
              <div className="campo">
                <label htmlFor={`p-rol-${i}`}>Rol</label>
                <select
                  id={`p-rol-${i}`}
                  value={p.rol}
                  onChange={(e) => cambiarPersona(i, { rol: e.target.value as RolDeHotel })}
                >
                  <option value="admin">Administrador</option>
                  <option value="recepcionista">Recepcionista</option>
                  <option value="housekeeping">Camarera (limpieza)</option>
                </select>
              </div>
              <div className="campo crece">
                <label htmlFor={`p-clave-${i}`}>Contraseña inicial</label>
                <input
                  id={`p-clave-${i}`}
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={p.contrasena}
                  required
                  onChange={(e) => cambiarPersona(i, { contrasena: e.target.value })}
                />
              </div>
              <button
                type="button"
                className="enlace"
                aria-label={`Quitar a la persona ${i + 1}`}
                disabled={personas.length === 1}
                onClick={() => setPersonas(personas.filter((_, j) => j !== i))}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="enlace"
            onClick={() => setPersonas([...personas, personaVacia('recepcionista')])}
          >
            <Plus size={14} /> Agregar persona
          </button>
          <div className="acciones-formulario">
            <button type="button" className="secundario" onClick={() => setPaso(1)}>
              <ArrowLeft size={16} /> Atrás
            </button>
            <button className="acento" disabled={enviando}>
              <Check size={16} /> {enviando ? 'Creando...' : 'Crear hotel'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
