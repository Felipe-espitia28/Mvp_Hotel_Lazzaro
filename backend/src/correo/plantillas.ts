// Plan 18: los correos de la cuenta. Funciones puras: devuelven el asunto, el
// HTML y el texto plano. Todo lo que viene de datos se escapa (un nombre con
// "<script>" no se ejecuta en el cliente de correo). Llevan el nombre y el
// color del hotel, sin el logo: los clientes de correo bloquean imágenes en base64.

export interface MarcaCorreo {
  // El hotel, o "Lazaro Software" para el equipo de la Consola.
  nombre: string;
  color: string;
  // El ingreso con la marca del hotel: URL_PUBLICA_APP/?hotel=slug.
  enlaceIngreso: string;
}

export interface Plantilla {
  asunto: string;
  html: string;
  texto: string;
}

export function escaparHtml(texto: string) {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Un color de la marca solo si es un hexadecimal (no se inyecta CSS).
const colorSeguro = (color: string) => (/^#[0-9a-fA-F]{6}$/.test(color) ? color : '#0f1b2d');

const fechaHora = (fecha: Date) =>
  fecha.toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    dateStyle: 'long',
    timeStyle: 'short',
  });

function envolver(
  marca: MarcaCorreo,
  titulo: string,
  parrafos: string[],
  boton?: { texto: string; url: string },
) {
  const color = colorSeguro(marca.color);
  const cuerpo = parrafos.map((p) => `<p style="margin:0 0 14px">${p}</p>`).join('');
  const accion = boton
    ? `<p style="margin:22px 0"><a href="${escaparHtml(boton.url)}" style="background:${color};color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">${escaparHtml(boton.texto)}</a></p>`
    : '';
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f4f5f7;font-family:Arial,sans-serif;color:#1f2933"><div style="max-width:560px;margin:24px auto;background:#fff;border-radius:8px;overflow:hidden"><div style="background:${color};color:#fff;padding:18px 24px;font-size:18px;font-weight:bold">${escaparHtml(marca.nombre)}</div><div style="padding:24px"><h1 style="font-size:20px;margin:0 0 16px">${escaparHtml(titulo)}</h1>${cuerpo}${accion}<p style="margin:24px 0 0;font-size:12px;color:#6b7280">Si no esperabas este correo, ignóralo o avísale al administrador de tu hotel.</p></div></div></body></html>`;
}

export function plantillaCredenciales(datos: {
  marca: MarcaCorreo;
  nombre: string;
  email: string;
  temporal: string;
  venceEn: Date;
  reenvio?: boolean;
}): Plantilla {
  const { marca } = datos;
  const asunto = datos.reenvio
    ? `${marca.nombre}: tus nuevas credenciales de acceso`
    : `Bienvenido a ${marca.nombre}: tu acceso`;
  const saludo = datos.reenvio
    ? `Hola, ${escaparHtml(datos.nombre)}. Te enviamos una nueva contraseña temporal; la anterior ya no sirve y tus sesiones abiertas se cerraron.`
    : `Hola, ${escaparHtml(datos.nombre)}. Ya tienes acceso al sistema del hotel.`;
  const html = envolver(
    marca,
    datos.reenvio ? 'Nuevas credenciales' : 'Tu acceso',
    [
      saludo,
      `Correo de acceso: <strong>${escaparHtml(datos.email)}</strong>`,
      `Contraseña temporal: <strong style="font-family:monospace;font-size:16px">${escaparHtml(datos.temporal)}</strong>`,
      `Vence el ${escaparHtml(fechaHora(datos.venceEn))}. Al entrar te pediremos crear tu propia contraseña.`,
    ],
    { texto: 'Ingresar', url: marca.enlaceIngreso },
  );
  const texto = [
    datos.reenvio
      ? `Hola, ${datos.nombre}. Te enviamos una nueva contraseña temporal; la anterior ya no sirve.`
      : `Hola, ${datos.nombre}. Ya tienes acceso al sistema de ${marca.nombre}.`,
    `Correo de acceso: ${datos.email}`,
    `Contraseña temporal: ${datos.temporal}`,
    `Vence el ${fechaHora(datos.venceEn)}. Al entrar te pediremos crear tu propia contraseña.`,
    `Ingresa en: ${marca.enlaceIngreso}`,
  ].join('\n');
  return { asunto, html, texto };
}

export function plantillaRecuperacion(datos: {
  marca: MarcaCorreo;
  nombre: string;
  enlace: string;
  minutos: number;
}): Plantilla {
  const asunto = `${datos.marca.nombre}: restablece tu contraseña`;
  const html = envolver(
    datos.marca,
    'Restablece tu contraseña',
    [
      `Hola, ${escaparHtml(datos.nombre)}. Pediste restablecer tu contraseña.`,
      `El enlace sirve una sola vez y vence en ${datos.minutos} minutos.`,
    ],
    { texto: 'Crear una contraseña nueva', url: datos.enlace },
  );
  const texto = [
    `Hola, ${datos.nombre}. Pediste restablecer tu contraseña.`,
    `Abre este enlace (sirve una sola vez y vence en ${datos.minutos} minutos):`,
    datos.enlace,
    'Si no lo pediste, ignora este correo: tu contraseña no cambia.',
  ].join('\n');
  return { asunto, html, texto };
}

export function plantillaContrasenaCambiada(datos: {
  marca: MarcaCorreo;
  nombre: string;
  fecha: Date;
}): Plantilla {
  const asunto = `${datos.marca.nombre}: tu contraseña cambió`;
  const html = envolver(datos.marca, 'Tu contraseña cambió', [
    `Hola, ${escaparHtml(datos.nombre)}. Tu contraseña se cambió el ${escaparHtml(fechaHora(datos.fecha))} y tus otras sesiones se cerraron.`,
    'Si no fuiste tú, usa "¿Olvidaste tu contraseña?" de inmediato y avísale al administrador.',
  ]);
  const texto = [
    `Hola, ${datos.nombre}. Tu contraseña se cambió el ${fechaHora(datos.fecha)} y tus otras sesiones se cerraron.`,
    'Si no fuiste tú, usa "¿Olvidaste tu contraseña?" de inmediato y avísale al administrador.',
  ].join('\n');
  return { asunto, html, texto };
}
