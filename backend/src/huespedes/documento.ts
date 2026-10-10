import { Transform } from 'class-transformer';

// "1.020.304.050", "1020 304 050" y "1020304050" son el mismo documento.
// La migración huespedes_unicos aplica la misma regla a los datos existentes.
export function normalizarDocumento(documento: string) {
  return documento.replace(/[.\s-]/g, '').toUpperCase();
}

export const NormalizarDocumento = () =>
  Transform(({ value }) => (typeof value === 'string' ? normalizarDocumento(value) : value));
