// Rombo de la marca: toma los colores del tema (los del hotel o los de Lazaro).
export function Rombo({ tamano = 34 }: { tamano?: number }) {
  return (
    <svg className="marca-rombo" width={tamano} height={tamano} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" style={{ fill: 'var(--dorado-500)', opacity: 0.14 }} />
      <path d="M16 5 L26 16 L16 27 L6 16 Z" style={{ fill: 'var(--dorado-500)' }} />
      <path d="M16 10.5 L21 16 L16 21.5 L11 16 Z" style={{ fill: 'var(--marca-900)' }} />
    </svg>
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
