// El JWT_SECRET firma las sesiones: si es débil o es el valor del ejemplo,
// cualquiera puede fabricar un token válido. Se valida al arrancar.

export const LARGO_MINIMO_SECRETO = 32;

// El valor de backend/.env.example (y sus variantes) nunca debe llegar a un despliegue.
const PREFIJO_DE_EJEMPLO = 'cambia-este-valor';

const COMO_GENERARLO = 'Genera uno con: openssl rand -base64 48';

export function validarSecretoJwt(secreto: string | undefined): string {
  if (!secreto) {
    throw new Error(`Falta la variable de entorno JWT_SECRET. ${COMO_GENERARLO}`);
  }
  if (secreto.toLowerCase().startsWith(PREFIJO_DE_EJEMPLO)) {
    throw new Error(`JWT_SECRET sigue con el valor de ejemplo. ${COMO_GENERARLO}`);
  }
  if (secreto.length < LARGO_MINIMO_SECRETO) {
    throw new Error(
      `JWT_SECRET debe tener al menos ${LARGO_MINIMO_SECRETO} caracteres. ${COMO_GENERARLO}`,
    );
  }
  return secreto;
}
