import type { LucideIcon } from 'lucide-react';

// Encabezado común de los modales: icono dorado y título en serif.
export function CabeceraModal({ icono: Icono, titulo }: { icono: LucideIcon; titulo: string }) {
  return (
    <div className="modal-cabecera">
      <div className="modal-icono">
        <Icono size={20} />
      </div>
      <h2>{titulo}</h2>
    </div>
  );
}
