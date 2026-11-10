import { Injectable, Logger } from '@nestjs/common';
import { urlPublicaApp } from '../comun/urls-publicas';
import { Reloj } from '../hotel/reloj';
import { PrismaService } from '../prisma/prisma.service';
import { MarcaCorreo, Plantilla } from './plantillas';
import { adaptadorCorreo } from './proveedores';

const MARCA_LAZARO = { nombre: 'Lazaro Software', color: '#0f1b2d' };

// Plan 18: envía un correo con el proveedor activo y deja el registro del
// envío (sin el contenido: la contraseña temporal y el enlace no quedan en la
// base). Un correo que falla no lanza: quien llama decide qué hacer.
@Injectable()
export class CorreoService {
  private readonly logger = new Logger(CorreoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reloj: Reloj,
  ) {}

  // El nombre y el color del hotel, y el enlace a su ingreso con marca.
  async marcaDe(hotelId: string | null): Promise<MarcaCorreo> {
    const hotel = hotelId
      ? await this.prisma.hotel.findUnique({
          where: { id: hotelId },
          select: { nombre: true, colorPrimario: true, slug: true },
        })
      : null;
    if (!hotel) return { ...MARCA_LAZARO, enlaceIngreso: urlPublicaApp() };
    return {
      nombre: hotel.nombre,
      color: hotel.colorPrimario,
      enlaceIngreso: `${urlPublicaApp()}/?hotel=${encodeURIComponent(hotel.slug)}`,
    };
  }

  async enviar(datos: {
    hotelId: string | null;
    usuarioId: string | null;
    plantilla: string;
    para: string;
    nombre: string;
    contenido: Plantilla;
  }) {
    const registro = {
      hotelId: datos.hotelId,
      usuarioId: datos.usuarioId,
      plantilla: datos.plantilla,
      destinatario: datos.para,
      fecha: this.reloj.ahora(),
    };
    try {
      const { idMensaje } = await adaptadorCorreo().enviar({
        para: datos.para,
        nombre: datos.nombre,
        asunto: datos.contenido.asunto,
        html: datos.contenido.html,
        texto: datos.contenido.texto,
      });
      await this.prisma.correoEnviado.create({
        data: { ...registro, estado: 'enviado', idMensaje },
      });
      return { enviado: true };
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      this.logger.warn(`No salió el correo "${datos.plantilla}" a ${datos.para}: ${mensaje}`);
      await this.prisma.correoEnviado.create({
        data: { ...registro, estado: 'fallido', error: mensaje.slice(0, 500) },
      });
      return { enviado: false };
    }
  }
}
