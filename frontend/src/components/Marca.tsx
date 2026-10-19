import { BedDouble } from 'lucide-react';

// Distintivo de la marca cuando el hotel no tiene logo: toma los colores del
// tema (los del hotel o los de Lazaro).
export function Rombo({ tamano = 36 }: { tamano?: number }) {
  return (
    <span className="marca-rombo" style={{ width: tamano, height: tamano }} aria-hidden>
      <BedDouble size={Math.round(tamano * 0.55)} strokeWidth={2} />
    </span>
  );
}

interface Props {
  nombre?: string;
  subtitulo?: string;
  // Logo del hotel (data URL); sin logo se muestra el rombo.
  logo?: string | null;
}

export function Marca({ nombre = 'MVP Hotel', subtitulo = 'Lazaro Software', logo }: Props) {
  return (
    <div className="marca">
      {logo ? <img className="marca-logo" src={logo} alt="" /> : <Rombo />}
      <div>
        <div className="marca-nombre">{nombre}</div>
        <div className="marca-sub">{subtitulo}</div>
      </div>
    </div>
  );
}

// Iniciales para los avatares ("Carlos Gómez" → "CG").
export function iniciales(nombre: string) {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]!.toUpperCase())
    .join('');
}
