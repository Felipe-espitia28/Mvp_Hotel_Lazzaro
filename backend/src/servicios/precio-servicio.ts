import { ModoPrecio } from '@prisma/client';
import { RangosEdad, clasificarEdades } from '../tarifas/motor-tarificacion';

// S-1 (R55): cuánto se cobra al cargar un servicio al folio. Función pura: el
// resultado se copia al cargo y queda congelado (cambiar el servicio después
// no altera los cargos hechos).

export interface PrecioDeServicio {
  nombre: string;
  modoPrecio: ModoPrecio;
  precio: number; // adulto o único
  precioNino: number | null; // por edad
}

export interface Quienes {
  cantidad?: number; // fijo: unidades; por persona: personas
  adultos?: number; // por edad
  edadesNinos?: number[]; // por edad: la edad de cada niño
}

export class DatosDePrecioError extends Error {}

// Pesos colombianos: los montos se redondean al peso.
const pesos = (valor: number) => Math.round(valor);

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

// Lo que lleva el cargo: cantidad, valor por unidad, total y concepto. En el
// modo por edad hay precios distintos en un mismo cargo: va como 1 × total y
// el concepto cuenta quiénes pagaron.
export function precioDelServicio(
  servicio: PrecioDeServicio,
  quienes: Quienes,
  rangos: RangosEdad,
) {
  if (servicio.modoPrecio !== 'por_edad') {
    const cantidad = quienes.cantidad;
    if (!cantidad || cantidad < 1) {
      throw new DatosDePrecioError(
        servicio.modoPrecio === 'por_persona' ? 'Indica cuántas personas' : 'Indica la cantidad',
      );
    }
    return {
      cantidad,
      valorUnitario: servicio.precio,
      total: pesos(servicio.precio * cantidad),
      concepto:
        servicio.modoPrecio === 'por_persona'
          ? `${servicio.nombre} (${plural(cantidad, 'persona', 'personas')})`
          : servicio.nombre,
    };
  }

  const edadesNinos = quienes.edadesNinos ?? [];
  if ((quienes.adultos ?? 0) + edadesNinos.length < 1) {
    throw new DatosDePrecioError('Indica al menos una persona');
  }
  // Un "niño" mayor que el rango de niño paga como adulto (A-3).
  const { adultos, gratis, conCargo } = clasificarEdades(
    { adultos: quienes.adultos ?? 0, edadesNinos },
    rangos,
  );
  const total = pesos(
    adultos * servicio.precio + conCargo * (servicio.precioNino ?? servicio.precio),
  );
  const detalle = [
    adultos > 0 && plural(adultos, 'adulto', 'adultos'),
    conCargo > 0 && plural(conCargo, 'niño', 'niños'),
    gratis > 0 && `${gratis} sin costo`,
  ]
    .filter(Boolean)
    .join(', ');
  return { cantidad: 1, valorUnitario: total, total, concepto: `${servicio.nombre} (${detalle})` };
}
