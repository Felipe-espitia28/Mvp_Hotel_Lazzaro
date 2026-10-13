// Logo del sistema: rombo dorado sobre azul noche + nombre.
export function Rombo({ tamano = 34 }: { tamano?: number }) {
  return (
    <svg className="marca-rombo" width={tamano} height={tamano} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="rgba(201,162,39,0.14)" />
      <path d="M16 5 L26 16 L16 27 L6 16 Z" fill="#c9a227" />
      <path d="M16 10.5 L21 16 L16 21.5 L11 16 Z" fill="#0f1b2d" />
    </svg>
  );
}

export function Marca() {
  return (
    <div className="marca">
      <Rombo />
      <div>
        <div className="marca-nombre">MVP Hotel</div>
        <div className="marca-sub">Lazaro Software</div>
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
