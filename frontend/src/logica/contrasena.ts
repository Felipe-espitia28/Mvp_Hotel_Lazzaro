// Plan 18: la política de contraseñas en pantalla (R72). Es solo una ayuda
// mientras se escribe: la regla real la aplica el backend.

export const LARGO_MINIMO_CONTRASENA = 10;

export interface ReglaContrasena {
  texto: string;
  cumple: boolean;
}

export function reglasContrasena(
  nueva: string,
  contexto: { email: string; temporal?: string },
): ReglaContrasena[] {
  const local = contexto.email.split('@')[0].toLowerCase();
  return [
    {
      texto: `Al menos ${LARGO_MINIMO_CONTRASENA} caracteres`,
      cumple: nueva.length >= LARGO_MINIMO_CONTRASENA,
    },
    {
      texto: 'Letras y números',
      cumple: /[a-zA-ZñÑáéíóúÁÉÍÓÚ]/.test(nueva) && /\d/.test(nueva),
    },
    ...(contexto.temporal !== undefined
      ? [{ texto: 'Distinta de la temporal', cumple: nueva !== '' && nueva !== contexto.temporal }]
      : []),
    {
      texto: 'Sin tu correo',
      cumple: nueva !== '' && (local.length < 3 || !nueva.toLowerCase().includes(local)),
    },
  ];
}

export const cumpleTodo = (reglas: ReglaContrasena[]) => reglas.every((r) => r.cumple);
