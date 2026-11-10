import { Check, X } from 'lucide-react';
import type { ReglaContrasena } from '../logica/contrasena';

// Plan 18 (R72): la política de contraseñas en vivo mientras se escribe.
export function ReglasContrasena({ reglas }: { reglas: ReglaContrasena[] }) {
  return (
    <ul className="reglas-contrasena" aria-label="Requisitos de la contraseña">
      {reglas.map((r) => (
        <li key={r.texto} className={r.cumple ? 'cumple' : ''}>
          {r.cumple ? <Check size={14} /> : <X size={14} />} {r.texto}
        </li>
      ))}
    </ul>
  );
}
