// Se ejecuta antes de cargar cualquier módulo de prueba: apunta Prisma a la
// base de datos de pruebas para no tocar nunca la de desarrollo.
// Prisma no sobrescribe variables ya definidas, así que esto gana sobre el .env.
process.env.JWT_SECRET = 'secreto-solo-para-pruebas';
// Las pruebas inician sesión muchas veces; el límite se prueba aparte (seguridad.e2e-spec).
process.env.LOGIN_INTENTOS_POR_MINUTO = '1000';
process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ??
  'postgresql://hotel:hotel@localhost:5432/mvp_hotel_test?schema=public';
