import { useState, type ChangeEvent, type FormEvent } from 'react';
import { ImagePlus, Save, X } from 'lucide-react';
import { api, type DatosServicio } from '../api/client';
import type {
  CategoriaServicio,
  ModoPrecio,
  Servicio,
  TipoServicio,
  ValorAtributo,
} from '../api/types';
import {
  ETIQUETA_MODO_PRECIO,
  ETIQUETA_TIPO_SERVICIO,
  camposDelTipo,
  codigoDesdeNombre,
} from '../logica/servicios';
import { CamposAtributos } from './CamposAtributos';

// Fotos con los mismos límites del logo (backend: hotel/marca.ts).
const TIPOS_FOTO = ['image/png', 'image/jpeg', 'image/webp'];
const PESO_MAXIMO_FOTO = 200 * 1024;
const MAXIMO_FOTOS = 3;
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

interface Props {
  // null = servicio nuevo.
  servicio: Servicio | null;
  categorias: CategoriaServicio[];
  categoriaInicial?: string;
  onGuardado: (servicio: Servicio, mensaje: string) => void;
  onCerrar: () => void;
}

const numeroONull = (texto: string) => (texto.trim() === '' ? null : Number(texto));
const texto = (valor: string | number | null | undefined) =>
  valor === null || valor === undefined ? '' : String(valor);

// S-1: alta y edición de un servicio. Muestra solo los campos de su tipo y los
// atributos propios de su categoría (R54).
export function FormServicio({
  servicio,
  categorias,
  categoriaInicial,
  onGuardado,
  onCerrar,
}: Props) {
  const [nombre, setNombre] = useState(servicio?.nombre ?? '');
  const [codigo, setCodigo] = useState(servicio?.codigo ?? '');
  const [descripcion, setDescripcion] = useState(servicio?.descripcion ?? '');
  const [categoriaId, setCategoriaId] = useState(
    servicio?.categoriaId ?? categoriaInicial ?? categorias[0]?.id ?? '',
  );
  const [tipo, setTipo] = useState<TipoServicio>(servicio?.tipo ?? 'consumo');
  const [modoPrecio, setModoPrecio] = useState<ModoPrecio>(servicio?.modoPrecio ?? 'fijo');
  const [precio, setPrecio] = useState(texto(servicio && Number(servicio.precio)));
  const [precioNino, setPrecioNino] = useState(
    texto(servicio?.precioNino && Number(servicio.precioNino)),
  );
  const [duracion, setDuracion] = useState(texto(servicio?.duracionMinutos));
  const [cupos, setCupos] = useState(texto(servicio?.cuposPorSalida));
  const [conHorario, setConHorario] = useState(Boolean(servicio?.disponibilidad));
  const [dias, setDias] = useState<number[]>(servicio?.disponibilidad?.dias ?? [1, 2, 3, 4, 5]);
  const [desde, setDesde] = useState(servicio?.disponibilidad?.desde ?? '08:00');
  const [hasta, setHasta] = useState(servicio?.disponibilidad?.hasta ?? '18:00');
  const [atributos, setAtributos] = useState<Record<string, ValorAtributo>>(
    servicio?.atributos ?? {},
  );
  const [visibleRecepcion, setVisibleRecepcion] = useState(servicio?.visibleRecepcion ?? true);
  const [fotos, setFotos] = useState<string[]>(servicio?.fotos ?? []);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categoria = categorias.find((c) => c.id === categoriaId);
  const campos = camposDelTipo(tipo);

  function cambiarCategoria(id: string) {
    setCategoriaId(id);
    // Cada categoría tiene sus atributos: los de la anterior no aplican.
    if (id !== servicio?.categoriaId) setAtributos({});
    else setAtributos(servicio.atributos);
  }

  function cambiarAtributo(clave: string, valor: ValorAtributo | undefined) {
    setAtributos((actual) => {
      const nuevo = { ...actual };
      if (valor === undefined) delete nuevo[clave];
      else nuevo[clave] = valor;
      return nuevo;
    });
  }

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    setGuardando(true);
    const datos: DatosServicio = {
      nombre,
      codigo: codigo.trim() || undefined,
      descripcion: descripcion.trim() || null,
      categoriaId,
      tipo,
      modoPrecio,
      precio: Number(precio),
      precioNino: modoPrecio === 'por_edad' ? numeroONull(precioNino) : null,
      duracionMinutos: campos.duracion ? numeroONull(duracion) : null,
      cuposPorSalida: campos.cupos ? numeroONull(cupos) : null,
      disponibilidad: conHorario ? { dias, desde, hasta } : null,
      atributos,
      visibleRecepcion,
    };
    try {
      const guardado = servicio
        ? await api.actualizarServicio(servicio.id, datos)
        : await api.crearServicio(datos);
      onGuardado(guardado, servicio ? `"${nombre}" actualizado.` : `"${nombre}" agregado.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el servicio');
    } finally {
      setGuardando(false);
    }
  }

  async function agregarFoto(evento: ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0];
    evento.target.value = '';
    if (!archivo || !servicio) return;
    setError(null);
    if (!TIPOS_FOTO.includes(archivo.type)) {
      setError('La foto debe ser una imagen PNG, JPG o WEBP.');
      return;
    }
    if (archivo.size > PESO_MAXIMO_FOTO) {
      setError('La foto debe pesar como máximo 200 KB.');
      return;
    }
    const lector = new FileReader();
    lector.onload = async () => {
      try {
        setFotos((await api.agregarFotoServicio(servicio.id, String(lector.result))).fotos ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo subir la foto');
      }
    };
    lector.readAsDataURL(archivo);
  }

  async function quitarFoto(indice: number) {
    if (!servicio) return;
    try {
      setFotos((await api.quitarFotoServicio(servicio.id, indice)).fotos ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo quitar la foto');
    }
  }

  return (
    <form onSubmit={guardar} className="form-servicio">
      <div className="barra-titulo">
        <h4>{servicio ? `Editar "${servicio.nombre}"` : 'Nuevo servicio'}</h4>
        <button type="button" className="enlace" onClick={onCerrar}>
          <X size={14} /> Cerrar
        </button>
      </div>
      {error && <div className="mensaje-error">{error}</div>}

      <div className="fila-campos">
        <div className="campo crece">
          <label htmlFor="srv-nombre">Nombre</label>
          <input
            id="srv-nombre"
            value={nombre}
            required
            maxLength={80}
            onChange={(e) => setNombre(e.target.value)}
          />
        </div>
        <div className="campo">
          <label htmlFor="srv-codigo">Código</label>
          <input
            id="srv-codigo"
            value={codigo}
            placeholder={codigoDesdeNombre(nombre || 'servicio')}
            maxLength={60}
            onChange={(e) => setCodigo(e.target.value)}
          />
        </div>
      </div>
      <div className="campo">
        <label htmlFor="srv-descripcion">Descripción</label>
        <textarea
          id="srv-descripcion"
          value={descripcion}
          maxLength={500}
          rows={2}
          onChange={(e) => setDescripcion(e.target.value)}
        />
      </div>

      <div className="fila-campos">
        <div className="campo">
          <label htmlFor="srv-categoria">Categoría</label>
          <select
            id="srv-categoria"
            value={categoriaId}
            required
            onChange={(e) => cambiarCategoria(e.target.value)}
          >
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
                {c.activa ? '' : ' (inactiva)'}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="srv-tipo">Tipo</label>
          <select
            id="srv-tipo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoServicio)}
          >
            {Object.entries(ETIQUETA_TIPO_SERVICIO).map(([valor, etiqueta]) => (
              <option key={valor} value={valor}>
                {etiqueta}
              </option>
            ))}
          </select>
        </div>
        {campos.duracion && (
          <div className="campo">
            <label htmlFor="srv-duracion">Duración (min)</label>
            <input
              id="srv-duracion"
              type="number"
              min={5}
              max={1440}
              required
              value={duracion}
              onChange={(e) => setDuracion(e.target.value)}
            />
          </div>
        )}
        {campos.cupos && (
          <div className="campo">
            <label htmlFor="srv-cupos">Cupos por salida</label>
            <input
              id="srv-cupos"
              type="number"
              min={1}
              max={500}
              required
              value={cupos}
              onChange={(e) => setCupos(e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="fila-campos">
        <div className="campo">
          <label htmlFor="srv-modo">Precio</label>
          <select
            id="srv-modo"
            value={modoPrecio}
            onChange={(e) => setModoPrecio(e.target.value as ModoPrecio)}
          >
            {Object.entries(ETIQUETA_MODO_PRECIO).map(([valor, etiqueta]) => (
              <option key={valor} value={valor}>
                {etiqueta}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="srv-precio">
            {modoPrecio === 'por_edad' ? 'Precio adulto' : 'Valor'} (con impuestos)
          </label>
          <input
            id="srv-precio"
            type="number"
            min={1}
            required
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
          />
        </div>
        {modoPrecio === 'por_edad' && (
          <div className="campo">
            <label htmlFor="srv-precio-nino">Precio niño</label>
            <input
              id="srv-precio-nino"
              type="number"
              min={0}
              required
              value={precioNino}
              onChange={(e) => setPrecioNino(e.target.value)}
            />
          </div>
        )}
      </div>
      {modoPrecio === 'por_edad' && (
        <p className="texto-secundario">
          Los niños gratis según los rangos de edad del hotel (Políticas) no pagan.
        </p>
      )}

      <label className="casilla">
        <input
          type="checkbox"
          checked={conHorario}
          onChange={(e) => setConHorario(e.target.checked)}
        />
        Se ofrece en días y horario específicos
      </label>
      {conHorario && (
        <div className="fila-campos">
          <div className="dias-semana" role="group" aria-label="Días que se ofrece">
            {DIAS.map((etiqueta, i) => (
              <label key={etiqueta} className="casilla">
                <input
                  type="checkbox"
                  checked={dias.includes(i + 1)}
                  onChange={(e) =>
                    setDias((actual) =>
                      e.target.checked ? [...actual, i + 1] : actual.filter((d) => d !== i + 1),
                    )
                  }
                />
                {etiqueta}
              </label>
            ))}
          </div>
          <div className="campo">
            <label htmlFor="srv-desde">Desde</label>
            <input
              id="srv-desde"
              type="time"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
            />
          </div>
          <div className="campo">
            <label htmlFor="srv-hasta">Hasta</label>
            <input
              id="srv-hasta"
              type="time"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
            />
          </div>
        </div>
      )}

      {categoria && categoria.atributos.length > 0 && (
        <>
          <h5>Campos de {categoria.nombre}</h5>
          <CamposAtributos
            definiciones={categoria.atributos}
            valores={atributos}
            onCambiar={cambiarAtributo}
          />
        </>
      )}

      <label className="casilla">
        <input
          type="checkbox"
          checked={visibleRecepcion}
          onChange={(e) => setVisibleRecepcion(e.target.checked)}
        />
        Recepción lo ve para cargarlo al folio
      </label>

      {servicio ? (
        <div className="fotos-servicio">
          {fotos.map((foto, i) => (
            <figure key={i}>
              <img src={foto} alt={`Foto ${i + 1} de ${servicio.nombre}`} />
              <button
                type="button"
                className="enlace"
                aria-label={`Quitar la foto ${i + 1}`}
                onClick={() => quitarFoto(i)}
              >
                <X size={14} />
              </button>
            </figure>
          ))}
          {fotos.length < MAXIMO_FOTOS && (
            <label className="boton-foto secundario">
              <ImagePlus size={16} /> Agregar foto
              <input type="file" accept={TIPOS_FOTO.join(',')} onChange={agregarFoto} hidden />
            </label>
          )}
          <span className="texto-secundario">Hasta 3 · PNG, JPG o WEBP · máx. 200 KB</span>
        </div>
      ) : (
        <p className="texto-secundario">Las fotos se agregan después de crear el servicio.</p>
      )}

      <button className="acento" disabled={guardando || !categoriaId}>
        <Save size={16} /> {guardando ? 'Guardando...' : 'Guardar'}
      </button>
    </form>
  );
}
