import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Plus, ShoppingBag } from 'lucide-react';
import { api } from '../../api/client';
import type { CategoriaCargo, ProductoConsumo } from '../../api/types';
import { ETIQUETA_CATEGORIA, formatearDinero } from '../../formato';

const CATEGORIAS = Object.keys(ETIQUETA_CATEGORIA) as CategoriaCargo[];

// Precio editable en línea: se guarda al salir del campo o con Enter.
function PrecioEditable({
  producto,
  onGuardar,
}: {
  producto: ProductoConsumo;
  onGuardar: (precio: number) => void;
}) {
  const [valor, setValor] = useState(String(Number(producto.precio)));
  useEffect(() => setValor(String(Number(producto.precio))), [producto.precio]);

  const guardar = () => {
    const precio = Number(valor);
    if (precio > 0 && precio !== Number(producto.precio)) onGuardar(precio);
    else setValor(String(Number(producto.precio)));
  };

  return (
    <input
      className="entrada-tabla entrada-precio"
      type="number"
      min={1}
      aria-label={`Precio de ${producto.nombre}`}
      value={valor}
      onChange={(e) => setValor(e.target.value)}
      onBlur={guardar}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

// Catálogo de consumos del hotel: lo que recepción carga a la habitación con
// un clic. Cambiar un precio no altera los cargos ya hechos.
export function CatalogoConsumos() {
  const [productos, setProductos] = useState<ProductoConsumo[]>([]);
  const [nombre, setNombre] = useState('');
  const [categoria, setCategoria] = useState<CategoriaCargo>('minibar');
  const [precio, setPrecio] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setProductos(await api.productos());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar el catálogo');
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function ejecutar(accion: () => Promise<unknown>, mensaje: string) {
    setError(null);
    setAviso(null);
    try {
      await accion();
      await cargar();
      setAviso(mensaje);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    }
  }

  function crear(evento: FormEvent) {
    evento.preventDefault();
    ejecutar(async () => {
      await api.crearProducto({ nombre, categoria, precio: Number(precio) });
      setNombre('');
      setPrecio('');
    }, `"${nombre}" agregado al catálogo.`);
  }

  return (
    <div>
      {error && <div className="mensaje-error">{error}</div>}
      {aviso && <div className="mensaje-exito">{aviso}</div>}

      <section className="tarjeta">
        <h3 className="tarjeta-titulo">
          <ShoppingBag size={18} /> Catálogo de consumos
        </h3>
        <p className="texto-secundario">
          Recepción los carga al folio con un clic, con su precio. Para algo fuera del catálogo (una
          cena a la carta) puede usar un valor libre. Los cambios de precio aplican a los consumos
          nuevos.
        </p>

        {CATEGORIAS.map((cat) => {
          const delGrupo = productos.filter((p) => p.categoria === cat);
          if (delGrupo.length === 0) return null;
          return (
            <div key={cat} className="grupo-catalogo">
              <h4>{ETIQUETA_CATEGORIA[cat]}</h4>
              <div className="contenedor-tabla">
                <table className="tabla">
                  <tbody>
                    {delGrupo.map((p) => (
                      <tr key={p.id} className={p.activo ? '' : 'fila-inactiva'}>
                        <td>{p.nombre}</td>
                        <td style={{ width: 170 }}>
                          <PrecioEditable
                            producto={p}
                            onGuardar={(nuevo) =>
                              ejecutar(
                                () => api.actualizarProducto(p.id, { precio: nuevo }),
                                `Nuevo precio de "${p.nombre}": ${formatearDinero(nuevo)}.`,
                              )
                            }
                          />
                        </td>
                        <td style={{ width: 130 }}>
                          <label className="casilla">
                            <input
                              type="checkbox"
                              checked={p.activo}
                              onChange={(e) =>
                                ejecutar(
                                  () => api.actualizarProducto(p.id, { activo: e.target.checked }),
                                  e.target.checked
                                    ? `"${p.nombre}" vuelve a ofrecerse.`
                                    : `"${p.nombre}" ya no se ofrece.`,
                                )
                              }
                            />
                            {p.activo ? 'Se ofrece' : 'Pausado'}
                          </label>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

        <form onSubmit={crear} className="form-temporada">
          <h4>
            <Plus size={15} /> Nuevo producto
          </h4>
          <div className="fila-campos">
            <div className="campo crece">
              <label htmlFor="prod-nombre">Nombre</label>
              <input
                id="prod-nombre"
                placeholder="p. ej. Jugo natural"
                value={nombre}
                required
                maxLength={80}
                onChange={(e) => setNombre(e.target.value)}
              />
            </div>
            <div className="campo">
              <label htmlFor="prod-categoria">Categoría</label>
              <select
                id="prod-categoria"
                value={categoria}
                onChange={(e) => setCategoria(e.target.value as CategoriaCargo)}
              >
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>
                    {ETIQUETA_CATEGORIA[c]}
                  </option>
                ))}
              </select>
            </div>
            <div className="campo">
              <label htmlFor="prod-precio">Precio (con impuestos)</label>
              <input
                id="prod-precio"
                type="number"
                min={1}
                value={precio}
                required
                onChange={(e) => setPrecio(e.target.value)}
              />
            </div>
          </div>
          <button className="acento">
            <Plus size={16} /> Agregar al catálogo
          </button>
        </form>
      </section>
    </div>
  );
}
