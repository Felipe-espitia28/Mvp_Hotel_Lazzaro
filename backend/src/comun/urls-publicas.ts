// Dónde ven los usuarios la app (ingreso de cada hotel, páginas de pago y de
// recuperación) y dónde reciben los proveedores sus eventos (Wompi).
export const urlPublicaApp = () => process.env.URL_PUBLICA_APP || 'http://localhost:5173';
export const urlPublicaApi = () =>
  process.env.URL_PUBLICA_API || `http://localhost:${process.env.PORT ?? 3000}`;
