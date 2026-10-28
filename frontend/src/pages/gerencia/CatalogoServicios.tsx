import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Clock,
  Download,
  FileUp,
  GripVertical,
  Map as IconoMapa,
  Plus,
  Shirt,
  ShoppingBag,
  Sparkles,
  Utensils,
  Wine,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../../api/client';
import type {
  CategoriaCargo,
  CategoriaServicio,
  Servicio,
  TipoAtributo,
  TipoServicio,
  ValorAtributo,
} from '../../api/types';
import { ETIQUETA_CATEGORIA, formatearDinero } from '../../formato';
import { ETIQUETA_MODO_PRECIO, ETIQUETA_TIPO_SERVICIO } from '../../logica/servicios';
import { FormServicio } from '../../components/FormServicio';
import { ImportadorArchivo } from '../../components/ImportadorArchivo';

// Plan 09: columnas fijas del archivo de servicios (más una por atributo propio).
const COLUMNAS_IMPORTACION = [
  { nombre: 'codigo', descripcion: 'obligatorio; si ya existe, se actualiza' },
  { nombre: 'nombre', descripcion: 'obligatorio al crear' },
  { nombre: 'descripcion', descripcion: 'opcional' },
  { nombre: 'tipo', descripcion: 'consumo, cita o experiencia' },
  { nombre: 'modo_precio', descripcion: 'fijo, por_persona o por_edad' },
  { nombre: 'precio', descripcion: 'obligatorio al crear; acepta 85.000' },
  { nombre: 'precio_nino', descripcion: 'si es por edad' },
  { nombre: 'duracion_minutos', descripcion: 'cita y experiencia' },
  { nombre: 'cupos_por_salida', descripcion: 'experiencia' },
  { nombre: 'visible_recepcion', descripcion: 'si o no' },
  { nombre: 'activo', descripcion: 'si o no; "no" lo retira' },
];

// Iconos que el hotel puede elegir para sus categorías.
const ICONOS: Record<string, LucideIcon> = {
  'shopping-bag': ShoppingBag,
  wine: Wine,
  shirt: Shirt,
  utensils: Utensils,
  clock: Clock,
  sparkles: Sparkles,
  map: IconoMapa,
};

const ETIQUETA_TIPO_ATRIBUTO: Record<TipoAtributo, string> = {
  texto: 'Texto',
  numero: 'Número',
  si_no: 'Sí / no',
  lista: 'Lista de opciones',
};

const CLASIFICACIONES = Object.keys(ETIQUETA_CATEGORIA) as CategoriaCargo[];

function IconoCategoria({ icono }: { icono: string | null }) {
  const Icono = (icono && ICONOS[icono]) || ShoppingBag;
  return <Icono size={16} />;
}

// Atributos propios de la categoría seleccionada (R54): la clave y el tipo no
// cambian; la etiqueta, las opciones y si es obligatorio, sí.
function EditorAtributos({
  categoria,
  ejecutar,
}: {
  categoria: CategoriaServicio;
  ejecutar: (accion: () => Promise<unknown>, mensaje: string) => Promise<boolean>;
}) {
  const [etiqueta, setEtiqueta] = useState('');
  const [tipo, setTipo] = useState<TipoAtributo>('texto');
  const [opciones, setOpciones] = useState('');
  const [obligatorio, setObligatorio] = useState(false);
  const separar = (texto: string) =>
    texto
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);

  async function crear(evento: FormEvent) {
    evento.preventDefault();
    const hecho = await ejecutar(
      () =>
        api.crearAtributo(categoria.id, {
          etiqueta,
          tipo,
          opciones: tipo === 'lista' ? separar(opciones) : undefined,
          obligatorio,
        }),
      `Campo "${etiqueta}" agregado a ${categoria.nombre}.`,
    );
    if (hecho) {
      setEtiqueta('');
      setOpciones('');
      setObligatorio(false);
    }
  }

  return (
    <div className="editor-atributos">
      <h4>Campos propios de {categoria.nombre}</h4>
      <p className="texto-secundario">
        Se muestran en cada servicio de la categoría y sirven para filtrar; no cambian el precio.
      </p>
      {categoria.atributos.length === 0 ? (
        <p className="texto-secundario">Sin campos propios.</p>
      ) : (
        <ul className="lista-atributos">
          {categoria.atributos.map((a) => (
            <li key={a.id}>
              <span>
                <strong>{a.etiqueta}</strong> · {ETIQUETA_TIPO_ATRIBUTO[a.tipo]}
                {a.tipo === 'lista' && ` (${a.opciones.join(', ')})`}
              </span>
              <span className="acciones-atributo">
                <label className="casilla">
                  <input
                    type="checkbox"
                    checked={a.obligatorio}
                    onChange={(e) =>
                      ejecutar(
                        () =>
                          api.actualizarAtributo(categoria.id, a.id, {
                            obligatorio: e.target.checked,
                          }),
                        `"${a.etiqueta}" ${e.target.checked ? 'es obligatorio' : 'es opcional'}.`,
                      )
                    }
                  />
                  Obligatorio
                </label>
                <button
                  type="button"
                  className="enlace"
                  onClick={() => {
                    const nueva = window.prompt('Nuevo nombre del campo', a.etiqueta)?.trim();
                    if (nueva && nueva !== a.etiqueta) {
                      ejecutar(
                        () => api.actualizarAtributo(categoria.id, a.id, { etiqueta: nueva }),
                        `Campo renombrado a "${nueva}".`,
                      );
                    }
                  }}
                >
                  Renombrar
                </button>
                {a.tipo === 'lista' && (
                  <button
                    type="button"
                    className="enlace"
                    onClick={() => {
                      const nuevas = window.prompt(
                        'Opciones separadas por comas',
                        a.opciones.join(', '),
                      );
                      if (nuevas !== null) {
                        ejecutar(
                          () =>
                            api.actualizarAtributo(categoria.id, a.id, {
                              opciones: separar(nuevas),
                            }),
                          `Opciones de "${a.etiqueta}" actualizadas.`,
                        );
                      }
                    }}
                  >
                    Opciones
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={crear} className="form-cargo">
        <input
          aria-label="Nombre del campo"
          placeholder="p. ej. Nivel de dificultad"
          value={etiqueta}
          maxLength={60}
          required
          onChange={(e) => setEtiqueta(e.target.value)}
        />
        <select
          aria-label="Tipo de campo"
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoAtributo)}
        >
          {Object.entries(ETIQUETA_TIPO_ATRIBUTO).map(([valor, texto]) => (
            <option key={valor} value={valor}>
              {texto}
            </option>
          ))}
        </select>
        {tipo === 'lista' && (
          <input
            aria-label="Opciones"
            placeholder="baja, media, alta"
            value={opciones}
            required
            onChange={(e) => setOpciones(e.target.value)}
          />
        )}
        <label className="casilla">
          <input
            type="checkbox"
            checked={obligatorio}
            onChange={(e) => setObligatorio(e.target.checked)}
          />
          Obligatorio
        </label>
        <button className="secundario">
          <Plus size={15} /> Agregar campo
        </button>
      </form>
    </div>
  );
}

// S-1: catálogo de servicios del hotel. A la izquierda, las categorías propias
// (con su orden y sus campos); a la derecha, los servicios con filtros.
// Cambiar un precio no altera los cargos ya hechos.
export function CatalogoServicios() {
  const [categorias, setCategorias] = useState<CategoriaServicio[]>([]);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  // null = todas las categorías.
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [tipo, setTipo] = useState<TipoServicio | ''>('');
  const [estado, setEstado] = useState<'' | 'true' | 'false'>('');
  const [buscar, setBuscar] = useState('');
  // Filtros por los atributos de la categoría seleccionada (lista y sí/no).
  const [porAtributo, setPorAtributo] = useState<Record<string, string>>({});
  // null = sin formulario; 'nuevo' = alta.
  const [editando, setEditando] = useState<Servicio | 'nuevo' | null>(null);
  const [arrastrada, setArrastrada] = useState<number | null>(null);
  const [importando, setImportando] = useState(false);
  const [nombreCategoria, setNombreCategoria] = useState('');
  const [clasificacion, setClasificacion] = useState<CategoriaCargo>('otro');
  const [icono, setIcono] = useState('shopping-bag');
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargarCategorias = useCallback(async () => {
    setCategorias(await api.categoriasServicio());
  }, []);

  const cargarServicios = useCallback(async () => {
    setServicios(
      await api.servicios({
        categoriaId: seleccionada ?? undefined,
        tipo: tipo || undefined,
        activo: estado === '' ? undefined : estado === 'true',
        buscar: buscar.trim() || undefined,
      }),
    );
  }, [seleccionada, tipo, estado, buscar]);

  useEffect(() => {
    cargarCategorias().catch((e) =>
      setError(e instanceof Error ? e.message : 'Error al cargar el catálogo'),
    );
  }, [cargarCategorias]);

  useEffect(() => {
    cargarServicios().catch((e) =>
      setError(e instanceof Error ? e.message : 'Error al cargar los servicios'),
    );
  }, [cargarServicios]);

  async function ejecutar(accion: () => Promise<unknown>, mensaje: string) {
    setError(null);
    setAviso(null);
    try {
      await accion();
      await Promise.all([cargarCategorias(), cargarServicios()]);
      setAviso(mensaje);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
      return false;
    }
  }

  function moverCategoria(desde: number, hasta: number) {
    if (hasta < 0 || hasta >= categorias.length || desde === hasta) return;
    const nuevas = [...categorias];
    const [movida] = nuevas.splice(desde, 1);
    nuevas.splice(hasta, 0, movida);
    setCategorias(nuevas); // se ve al instante; el backend confirma el orden
    ejecutar(
      () => api.ordenarCategoriasServicio(nuevas.map((c) => c.id)),
      'Orden de las categorías guardado.',
    );
  }

  async function crearCategoria(evento: FormEvent) {
    evento.preventDefault();
    const hecho = await ejecutar(
      () => api.crearCategoriaServicio({ nombre: nombreCategoria, clasificacion, icono }),
      `Categoría "${nombreCategoria}" creada.`,
    );
    if (hecho) setNombreCategoria('');
  }

  function elegirCategoria(id: string | null) {
    setSeleccionada(id);
    setPorAtributo({});
  }

  async function abrir(servicio: Servicio) {
    // El detalle trae las fotos (la lista no).
    try {
      setEditando(await api.servicio(servicio.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir el servicio');
    }
  }

  const categoria = categorias.find((c) => c.id === seleccionada);
  const filtrables = categoria?.atributos.filter((a) => a.tipo === 'lista' || a.tipo === 'si_no');
  // Los atributos solo se filtran en el navegador: no entran en ningún cálculo.
  const visibles = servicios.filter((s) =>
    Object.entries(porAtributo).every(([clave, valor]) => {
      if (valor === '') return true;
      const actual: ValorAtributo | undefined = s.atributos[clave];
      return valor === 'si' ? actual === true : valor === 'no' ? actual !== true : actual === valor;
    }),
  );

  return (
    <div>
      {error && <div className="mensaje-error">{error}</div>}
      {aviso && <div className="mensaje-exito">{aviso}</div>}

      <div className="catalogo-servicios">
        <section className="tarjeta panel-categorias">
          <h3 className="tarjeta-titulo">
            <ShoppingBag size={18} /> Categorías
          </h3>
          <p className="texto-secundario">Arrastra para ordenarlas como las verá recepción.</p>
          <ul className="lista-categorias">
            <li>
              <button
                className={`categoria-item ${seleccionada === null ? 'activa' : ''}`}
                onClick={() => elegirCategoria(null)}
              >
                Todas
              </button>
            </li>
            {categorias.map((c, i) => (
              <li
                key={c.id}
                draggable
                onDragStart={() => setArrastrada(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (arrastrada !== null) moverCategoria(arrastrada, i);
                  setArrastrada(null);
                }}
                className={c.activa ? '' : 'fila-inactiva'}
              >
                <GripVertical size={14} className="agarre" aria-hidden />
                <button
                  className={`categoria-item ${seleccionada === c.id ? 'activa' : ''}`}
                  onClick={() => elegirCategoria(c.id)}
                >
                  <IconoCategoria icono={c.icono} /> {c.nombre}
                  <span className="texto-secundario"> · {ETIQUETA_CATEGORIA[c.clasificacion]}</span>
                </button>
                <span className="acciones-categoria">
                  <button
                    className="enlace"
                    aria-label={`Subir ${c.nombre}`}
                    disabled={i === 0}
                    onClick={() => moverCategoria(i, i - 1)}
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    className="enlace"
                    aria-label={`Bajar ${c.nombre}`}
                    disabled={i === categorias.length - 1}
                    onClick={() => moverCategoria(i, i + 1)}
                  >
                    <ArrowDown size={14} />
                  </button>
                </span>
              </li>
            ))}
          </ul>

          {categoria && (
            <div className="acciones-barra">
              <button
                className="enlace"
                onClick={() => {
                  const nuevo = window.prompt('Nuevo nombre de la categoría', categoria.nombre);
                  if (nuevo?.trim() && nuevo.trim() !== categoria.nombre) {
                    ejecutar(
                      () => api.actualizarCategoriaServicio(categoria.id, { nombre: nuevo.trim() }),
                      `Categoría renombrada a "${nuevo.trim()}".`,
                    );
                  }
                }}
              >
                Renombrar
              </button>
              <button
                className="enlace"
                onClick={() =>
                  ejecutar(
                    () =>
                      api.actualizarCategoriaServicio(categoria.id, {
                        activa: !categoria.activa,
                      }),
                    categoria.activa
                      ? `"${categoria.nombre}" ya no se ofrece en recepción.`
                      : `"${categoria.nombre}" vuelve a ofrecerse.`,
                  )
                }
              >
                {categoria.activa ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          )}

          <form onSubmit={crearCategoria} className="form-cargo">
            <input
              aria-label="Nombre de la categoría"
              placeholder="p. ej. Masajes"
              value={nombreCategoria}
              maxLength={60}
              required
              onChange={(e) => setNombreCategoria(e.target.value)}
            />
            <select
              aria-label="Clasificación contable"
              value={clasificacion}
              onChange={(e) => setClasificacion(e.target.value as CategoriaCargo)}
            >
              {CLASIFICACIONES.map((c) => (
                <option key={c} value={c}>
                  {ETIQUETA_CATEGORIA[c]}
                </option>
              ))}
            </select>
            <select aria-label="Icono" value={icono} onChange={(e) => setIcono(e.target.value)}>
              {Object.keys(ICONOS).map((nombre) => (
                <option key={nombre} value={nombre}>
                  {nombre}
                </option>
              ))}
            </select>
            <button className="secundario">
              <Plus size={15} /> Crear categoría
            </button>
          </form>

          {categoria && <EditorAtributos categoria={categoria} ejecutar={ejecutar} />}
        </section>

        <section className="tarjeta panel-servicios">
          <div className="barra-titulo">
            <h3 className="tarjeta-titulo">Servicios{categoria && ` · ${categoria.nombre}`}</h3>
            <div className="acciones-barra">
              {categoria && (
                <>
                  <button
                    className="secundario"
                    onClick={() =>
                      api
                        .descargarPlantillaServicios(categoria.id)
                        .catch((e) =>
                          setError(e instanceof Error ? e.message : 'No se pudo descargar'),
                        )
                    }
                  >
                    <Download size={16} /> Plantilla
                  </button>
                  <button className="secundario" onClick={() => setImportando(true)}>
                    <FileUp size={16} /> Importar
                  </button>
                </>
              )}
              <button
                className="acento"
                disabled={categorias.length === 0}
                onClick={() => setEditando('nuevo')}
              >
                <Plus size={16} /> Nuevo servicio
              </button>
            </div>
          </div>
          {!categoria && categorias.length > 0 && (
            <p className="texto-secundario">
              Elige una categoría para descargar su plantilla o importar sus servicios desde Excel.
            </p>
          )}

          {importando && categoria && (
            <ImportadorArchivo
              titulo={`Importar servicios de ${categoria.nombre}`}
              columnas={[
                ...COLUMNAS_IMPORTACION,
                ...categoria.atributos.map((a) => ({
                  nombre: a.etiqueta,
                  descripcion: a.tipo === 'lista' ? a.opciones.join(', ') : 'campo propio',
                })),
              ]}
              etiquetaClave="Código"
              validar={(filas) => api.validarImportacionServicios(categoria.id, filas)}
              aplicar={(filas) => api.importarServicios(categoria.id, filas)}
              onPlantilla={() =>
                api
                  .descargarPlantillaServicios(categoria.id)
                  .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo descargar'))
              }
              onCerrar={() => setImportando(false)}
              onImportado={({ resumen }) => {
                setImportando(false);
                setError(null);
                setAviso(
                  `Importación lista: ${resumen.crear} nuevos, ${resumen.actualizar} actualizados.`,
                );
                cargarServicios();
              }}
            />
          )}

          <div className="form-cargo">
            <input
              aria-label="Buscar servicio"
              placeholder="Buscar por nombre o código"
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
            />
            <select
              aria-label="Tipo de servicio"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoServicio | '')}
            >
              <option value="">Todos los tipos</option>
              {Object.entries(ETIQUETA_TIPO_SERVICIO).map(([valor, etiqueta]) => (
                <option key={valor} value={valor}>
                  {etiqueta}
                </option>
              ))}
            </select>
            <select
              aria-label="Estado"
              value={estado}
              onChange={(e) => setEstado(e.target.value as '' | 'true' | 'false')}
            >
              <option value="">Activos e inactivos</option>
              <option value="true">Se ofrecen</option>
              <option value="false">Pausados</option>
            </select>
            {filtrables?.map((a) => (
              <select
                key={a.id}
                aria-label={`Filtrar por ${a.etiqueta}`}
                value={porAtributo[a.clave] ?? ''}
                onChange={(e) =>
                  setPorAtributo((actual) => ({ ...actual, [a.clave]: e.target.value }))
                }
              >
                <option value="">{a.etiqueta}: todos</option>
                {a.tipo === 'si_no' ? (
                  <>
                    <option value="si">{a.etiqueta}: sí</option>
                    <option value="no">{a.etiqueta}: no</option>
                  </>
                ) : (
                  a.opciones.map((o) => (
                    <option key={o} value={o}>
                      {a.etiqueta}: {o}
                    </option>
                  ))
                )}
              </select>
            ))}
          </div>

          {editando && (
            <FormServicio
              key={editando === 'nuevo' ? 'nuevo' : editando.id}
              servicio={editando === 'nuevo' ? null : editando}
              categorias={categorias}
              categoriaInicial={seleccionada ?? undefined}
              onCerrar={() => setEditando(null)}
              onGuardado={async (guardado, mensaje) => {
                setAviso(mensaje);
                setError(null);
                await cargarServicios();
                // Un servicio nuevo queda abierto para agregarle las fotos.
                setEditando(editando === 'nuevo' ? await api.servicio(guardado.id) : null);
              }}
            />
          )}

          {visibles.length === 0 ? (
            <p className="texto-secundario">No hay servicios con estos filtros.</p>
          ) : (
            <div className="contenedor-tabla">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Servicio</th>
                    <th>Tipo</th>
                    <th>Precio</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((s) => (
                    <tr key={s.id} className={s.activo ? '' : 'fila-inactiva'}>
                      <td>
                        <button className="enlace" onClick={() => abrir(s)}>
                          {s.nombre}
                        </button>
                        <div className="texto-secundario">
                          {s.codigo} · {s.categoria.nombre}
                          {!s.visibleRecepcion && ' · oculto para recepción'}
                        </div>
                      </td>
                      <td>{ETIQUETA_TIPO_SERVICIO[s.tipo]}</td>
                      <td>
                        {formatearDinero(s.precio)}
                        {s.modoPrecio === 'por_edad' &&
                          s.precioNino !== null &&
                          ` · niño ${formatearDinero(s.precioNino)}`}
                        <div className="texto-secundario">{ETIQUETA_MODO_PRECIO[s.modoPrecio]}</div>
                      </td>
                      <td>
                        <label className="casilla">
                          <input
                            type="checkbox"
                            checked={s.activo}
                            onChange={(e) =>
                              ejecutar(
                                () => api.actualizarServicio(s.id, { activo: e.target.checked }),
                                e.target.checked
                                  ? `"${s.nombre}" vuelve a ofrecerse.`
                                  : `"${s.nombre}" ya no se ofrece.`,
                              )
                            }
                          />
                          {s.activo ? 'Se ofrece' : 'Pausado'}
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
