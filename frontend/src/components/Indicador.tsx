import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

// Tarjeta de un indicador del panel: icono, título, valor y un detalle.
export function Indicador({
  titulo,
  valor,
  detalle,
  icono: Icono,
  tono,
}: {
  titulo: string;
  valor: string;
  detalle?: ReactNode;
  icono: LucideIcon;
  tono?: 'dorado' | 'verde' | 'ambar';
}) {
  return (
    <div className="indicador">
      <div className={`indicador-icono ${tono ?? ''}`}>
        <Icono size={20} />
      </div>
      <div>
        <div className="indicador-titulo">{titulo}</div>
        <div className="indicador-valor">{valor}</div>
        {detalle && <div className="texto-secundario">{detalle}</div>}
      </div>
    </div>
  );
}
