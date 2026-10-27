import { useEffect, useState, type FormEvent } from 'react';
import { Send } from 'lucide-react';
import { api } from '../../api/client';
import type { PoliticaDatos as Politica } from '../../api/types';
import { formatearFechaHora } from '../../formato';

// R45 (Ley 1581): la política de tratamiento de datos que aceptan los
// huéspedes en el check-in. No se edita: cada cambio publica una versión
// nueva, y desde ahí los huéspedes la aceptan de nuevo.
export function PoliticaDatos() {
  const [vigente, setVigente] = useState<Politica | null>(null);
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [publicando, setPublicando] = useState(false);

  useEffect(() => {
    api
      .politicaDatos()
      .then((p) => {
        setVigente(p);
        setTexto(p.texto);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo cargar la política'));
  }, []);

  const sinCambios = !vigente || texto.trim() === vigente.texto.trim();

  async function publicar(evento: FormEvent) {
    evento.preventDefault();
    if (
      !window.confirm(
        'Se publicará una versión nueva. Los huéspedes la aceptarán en su próximo check-in; las aceptaciones anteriores quedan con su versión.',
      )
    ) {
      return;
    }
    setError(null);
    setAviso(null);
    setPublicando(true);
    try {
      const nueva = await api.publicarPoliticaDatos(texto);
      setVigente(nueva);
      setTexto(nueva.texto);
      setAviso(`Versión ${nueva.version} publicada.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo publicar la política');
    } finally {
      setPublicando(false);
    }
  }

  return (
    <section className="tarjeta">
      <h3 className="tarjeta-titulo">Política de tratamiento de datos</h3>
      {error && <div className="mensaje-error">{error}</div>}
      {aviso && <div className="mensaje-exito">{aviso}</div>}
      {vigente && (
        <p className="texto-secundario">
          Vigente: <strong>versión {vigente.version}</strong>, desde el{' '}
          {formatearFechaHora(vigente.vigenteDesde)}. Cada adulto la acepta en el check-in (Ley 1581
          de 2012); la de un menor la da su responsable.
        </p>
      )}
      <form onSubmit={publicar} className="formulario-gerencia">
        <div className="campo">
          <label htmlFor="politica-texto">Texto de la política</label>
          <textarea
            id="politica-texto"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={10}
            maxLength={20000}
            required
          />
        </div>
        <p className="mensaje-aviso">
          Las aceptaciones anteriores quedan con su versión. ⚖️ Valida el texto con un asesor legal.
        </p>
        <button className="acento" disabled={publicando || sinCambios || !texto.trim()}>
          <Send size={16} /> {publicando ? 'Publicando...' : 'Publicar versión nueva'}
        </button>
      </form>
    </section>
  );
}
