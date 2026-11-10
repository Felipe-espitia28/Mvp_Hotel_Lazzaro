// Plan 18: puerto de correo (el INotificador de la hoja de ruta). El resto de
// la app solo conoce esto; los adaptadores (simulado y Brevo) hablan con el
// proveedor.

export type ProveedorCorreo = 'simulado' | 'brevo';

export interface CorreoSaliente {
  para: string;
  nombre: string;
  asunto: string;
  html: string;
  texto: string;
}

export interface ICorreo {
  readonly proveedor: ProveedorCorreo;
  // Devuelve el id del mensaje en el proveedor o lanza un error.
  enviar(correo: CorreoSaliente): Promise<{ idMensaje: string }>;
}
