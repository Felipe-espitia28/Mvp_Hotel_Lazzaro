import { useState, type FormEvent } from 'react';
import { History, Search } from 'lucide-react';
import { iniciales } from '../components/Marca';
import { api } from '../api/client';
import type { HuespedDetalle, HuespedResumen } from '../api/types';
import { RegistroHotelero } from '../components/RegistroHotelero';
import {
  ETIQUETA_ESTADO,
  ETIQUETA_TIPO_DOCUMENTO,
  formatearDinero,
  formatearFecha,
} from '../formato';

// Directorio de clientes del hotel: búsqueda y ficha con su historial de estadías.
export function Huespedes() {
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState<HuespedResumen[] | null>(null);
  const [ficha, setFicha] = useState<HuespedDetalle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);

  async function buscar(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    setFicha(null);
    setBuscando(true);
    try {
      setResultados(await api.buscarHuespedes(texto));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al buscar');
    } finally {
      setBuscando(false);
    }
  }

  async function abrirFicha(id: string) {
    setError(null);
    try {
      setFicha(await api.detalleHuesped(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar el huésped');
    }
  }

  return (
    <div>
      <div className="barra-titulo">
        <h2>Huéspedes</h2>
      </div>
      <form className="barra-busqueda" onSubmit={buscar}>
        <input
          placeholder="Nombre o número de documento"
          aria-label="Buscar huésped"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <button className="primario" disabled={!texto.trim() || buscando}>
          <Search size={16} /> {buscando ? 'Buscando...' : 'Buscar'}
        </button>
      </form>
      {error && <div className="mensaje-error">{error}</div>}

      {resultados &&
        (resultados.length === 0 ? (
          <p className="vacio">No hay huéspedes que coincidan.</p>
        ) : (
          <div className="contenedor-tabla">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Documento</th>
                  <th>Teléfono</th>
                  <th>Reservas</th>
                </tr>
              </thead>
              <tbody>
                {resultados.map((h) => (
                  <tr
                    key={h.id}
                    className={`fila-clic ${ficha?.id === h.id ? 'fila-seleccionada' : ''}`}
                    onClick={() => abrirFicha(h.id)}
                  >
                    <td>
                      <div className="celda-huesped">
                        <span className="avatar claro">{iniciales(h.nombre)}</span>
                        {h.nombre}
                      </div>
                    </td>
                    <td>
                      {h.documento}
                      <div className="texto-secundario">
                        {ETIQUETA_TIPO_DOCUMENTO[h.tipoDocumento]}
                      </div>
                    </td>
                    <td>{h.telefono ?? '—'}</td>
                    <td>{h._count.reservas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {ficha && (
        <section className="tarjeta ficha">
          <h3 className="tarjeta-titulo">
            <History size={18} /> Historial de {ficha.nombre}{' '}
            <span className="texto-secundario">
              ({ficha.reservas.length} {ficha.reservas.length === 1 ? 'reserva' : 'reservas'})
            </span>
          </h3>
          <div className="contenedor-tabla">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Habitación</th>
                  <th>Estadía</th>
                  <th>Estado</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {ficha.reservas.map((r) => (
                  <tr key={r.id}>
                    <td>{r.habitacion.numero}</td>
                    <td>
                      {formatearFecha(r.fechaEntrada)} → {formatearFecha(r.fechaSalida)}
                    </td>
                    <td>
                      <span className={`badge-estado ${r.estado}`}>
                        {ETIQUETA_ESTADO[r.estado]}
                      </span>
                    </td>
                    <td>{formatearDinero(r.total ?? r.valorAlojamiento)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <RegistroHotelero />
    </div>
  );
}
