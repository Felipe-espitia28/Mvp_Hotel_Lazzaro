import { CorreoSaliente, ICorreo } from './puerto';

// Plan 18: adaptador real de Brevo (API de correo transaccional), según su
// documentación: POST /v3/smtp/email con la cabecera api-key; responde 201
// con { messageId }. Si algo difiere al conectar la cuenta, se corrige solo
// aquí y en su prueba (ver docs/CORREO_BREVO.md).

export const URL_BREVO = 'https://api.brevo.com/v3/smtp/email';
const TIEMPO_ESPERA_MS = 10_000;

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface ConfiguracionBrevo {
  apiKey: string;
  remitenteEmail: string;
  remitenteNombre: string;
}

export class AdaptadorBrevo implements ICorreo {
  readonly proveedor = 'brevo' as const;

  constructor(
    private readonly config: ConfiguracionBrevo,
    // Inyectable: las pruebas usan un fetch falso, sin red.
    private readonly pedir: Fetch = fetch,
  ) {}

  async enviar(correo: CorreoSaliente) {
    const respuesta = await this.pedir(URL_BREVO, {
      method: 'POST',
      headers: {
        'api-key': this.config.apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: this.config.remitenteNombre, email: this.config.remitenteEmail },
        to: [{ email: correo.para, name: correo.nombre }],
        subject: correo.asunto,
        htmlContent: correo.html,
        textContent: correo.texto,
      }),
      signal: AbortSignal.timeout(TIEMPO_ESPERA_MS),
    });
    const cuerpo = (await respuesta.json().catch(() => null)) as {
      messageId?: string;
      code?: string;
      message?: string;
    } | null;
    if (!respuesta.ok) {
      throw new Error(
        `Brevo respondió ${respuesta.status}${cuerpo?.message ? `: ${cuerpo.message}` : ''}`,
      );
    }
    if (!cuerpo?.messageId) throw new Error('Brevo no devolvió el id del mensaje');
    return { idMensaje: cuerpo.messageId };
  }
}
