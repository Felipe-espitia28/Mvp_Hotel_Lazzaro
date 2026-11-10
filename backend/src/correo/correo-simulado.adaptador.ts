import { randomUUID } from 'node:crypto';
import { CorreoSaliente, ICorreo } from './puerto';

// Plan 18: correo simulado para el desarrollo, la demo y las pruebas. No envía
// nada: guarda los correos en una bandeja en memoria y, fuera de producción,
// los imprime en la consola del backend (ahí se lee la contraseña temporal).
// Prohibido en producción.

const bandeja: (CorreoSaliente & { idMensaje: string })[] = [];

export const CorreoSimulado = {
  // Las pruebas leen y vacían la bandeja; `fallar` simula un proveedor caído.
  bandeja: () => [...bandeja],
  vaciar: () => {
    bandeja.length = 0;
  },
  fallar: false,
};

export class AdaptadorCorreoSimulado implements ICorreo {
  readonly proveedor = 'simulado' as const;

  enviar(correo: CorreoSaliente) {
    if (CorreoSimulado.fallar) {
      return Promise.reject(new Error('Correo simulado en modo falla'));
    }
    const idMensaje = `simulado-${randomUUID()}`;
    bandeja.push({ ...correo, idMensaje });
    if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
      console.log(
        `\n[correo simulado] Para: ${correo.nombre} <${correo.para}>\nAsunto: ${correo.asunto}\n${correo.texto}\n`,
      );
    }
    return Promise.resolve({ idMensaje });
  }
}
