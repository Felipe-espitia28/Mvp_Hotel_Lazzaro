import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IntentoPago, Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { ContextoHotel, UsuarioAutenticado } from '../auth/decoradores';
import { PrismaService } from '../prisma/prisma.service';
import { Reloj } from '../hotel/reloj';
import {
  anticiposVigentes,
  bloquearReserva,
  detallePago,
  dinero,
  saldoDe,
} from '../folio/folio.service';
import { cifrar, descifrar, llaveMaestra } from './cifrado';
import { Ambiente, LlavesWompi, problemaConLlaves } from './llaves';
import { PasarelaSimulada } from './pasarela-simulada.adaptador';
import { proveedorActivo, urlPublicaApi, urlPublicaApp } from './pasarelas';
import { IPasarelaDePagos, Transaccion } from './puerto';
import { PasarelaWompi } from './wompi.adaptador';

export const MENSAJE_SIN_LLAVES = 'Conecte su cuenta de Wompi en Gerencia → Pagos en línea';
const HORAS_VIGENCIA_LINK = 48;
// La reconciliación espera este tiempo antes de preguntarle a la pasarela.
const MINUTOS_ANTES_DE_RECONCILIAR = 15;

// Lo que se muestra de un intento (sin datos del proveedor).
const SELECCION_INTENTO = {
  id: true,
  referencia: true,
  monto: true,
  proveedor: true,
  estado: true,
  url: true,
  expiraEn: true,
  alerta: true,
  creadoEn: true,
  pagoId: true,
} as const;

// B-2: cobros a distancia con un link de pago. El pago existe solo cuando la
// pasarela lo confirma con un evento firmado (R29), nunca por la redirección
// del navegador. El dominio solo conoce el puerto IPasarelaDePagos.
@Injectable()
export class PagosEnLineaService {
  private readonly logger = new Logger(PagosEnLineaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reloj: Reloj,
  ) {}

  async estado(hotelId: string) {
    const proveedor = proveedorActivo();
    const [hotel, config] = await Promise.all([
      this.prisma.hotel.findUniqueOrThrow({ where: { id: hotelId }, select: { slug: true } }),
      this.prisma.configuracionPasarela.findUnique({
        where: { hotelId },
        select: { ambiente: true, actualizadoEn: true },
      }),
    ]);
    const disponible = proveedor === 'simulada' || !!config;
    return {
      proveedor,
      configurada: !!config,
      ambiente: config?.ambiente ?? null,
      actualizadoEn: config?.actualizadoEn ?? null,
      disponible,
      mensaje: disponible ? null : MENSAJE_SIN_LLAVES,
      urlWebhook: `${urlPublicaApi()}/webhooks/wompi/${hotel.slug}`,
    };
  }

  // El monto lo pone el servidor: el anticipo sugerido si aún no se pagó, o
  // el saldo. Recepción puede pedir otro monto, sin pasar del saldo.
  async crearLink(
    hotel: ContextoHotel,
    reservaId: string,
    montoPedido: number | undefined,
    quien: UsuarioAutenticado,
  ) {
    const reserva = await this.prisma.reserva.findFirst({
      where: { id: reservaId, hotelId: hotel.id },
    });
    if (!reserva) throw new NotFoundException('Reserva no encontrada');
    const pasarela = await this.pasarelaDe(hotel.id);
    if (!pasarela) throw new ConflictException(MENSAJE_SIN_LLAVES);

    const { saldo } = await saldoDe(this.prisma, reserva);
    if (saldo <= 0) throw new ConflictException('La cuenta de esta reserva ya está saldada');
    if (montoPedido !== undefined && montoPedido > saldo) {
      throw new BadRequestException(`El monto supera el saldo pendiente (${dinero(saldo)})`);
    }
    const anticipos = (await anticiposVigentes(this.prisma, [reserva.id])).get(reserva.id) ?? 0;
    const anticipoPendiente =
      reserva.estado === 'confirmada' && anticipos === 0 && reserva.anticipoSugerido?.toNumber();
    const monto = montoPedido ?? (anticipoPendiente ? Math.min(anticipoPendiente, saldo) : saldo);

    const ahora = this.reloj.ahora();
    const referencia = `PG${randomBytes(6).toString('hex').toUpperCase()}`;
    const expiraEn = new Date(ahora.getTime() + HORAS_VIGENCIA_LINK * 3_600_000);
    const url = await pasarela.crearLinkDePago({
      referencia,
      monto,
      expiraEn,
      urlRetorno: `${urlPublicaApp()}/pago-resultado?referencia=${referencia}`,
    });
    const [intento] = await this.prisma.$transaction([
      this.prisma.intentoPago.create({
        data: {
          hotelId: hotel.id,
          reservaId,
          referencia,
          monto,
          proveedor: pasarela.proveedor,
          url,
          expiraEn,
          usuarioId: quien.id,
          creadoEn: ahora,
        },
        select: SELECCION_INTENTO,
      }),
      this.prisma.eventoReserva.create({
        data: {
          reservaId,
          tipo: 'link_de_pago',
          usuarioId: quien.id,
          fecha: ahora,
          detalle: `Link de pago por ${dinero(monto)} (ref. ${referencia})`,
          datos: { referencia, proveedor: pasarela.proveedor },
        },
      }),
    ]);
    return intento;
  }

  async intentosDe(hotelId: string, reservaId: string) {
    const reserva = await this.prisma.reserva.findFirst({
      where: { id: reservaId, hotelId },
      select: { id: true },
    });
    if (!reserva) throw new NotFoundException('Reserva no encontrada');
    return this.prisma.intentoPago.findMany({
      where: { reservaId },
      select: SELECCION_INTENTO,
      orderBy: { creadoEn: 'desc' },
    });
  }

  // POST /webhooks/wompi/:hotelSlug. Una referencia desconocida (o de otro
  // hotel) responde 200 sin hacer nada, para que la pasarela no reintente.
  async recibirWebhook(slug: string, cuerpo: unknown) {
    const hotel = await this.prisma.hotel.findUnique({ where: { slug }, select: { id: true } });
    if (!hotel) throw new NotFoundException('Hotel no encontrado');
    const pasarela = await this.pasarelaDe(hotel.id);
    if (!pasarela) throw new UnauthorizedException('Este hotel no tiene la pasarela configurada');
    const { firmaValida, transaccion } = pasarela.verificarEvento(cuerpo);
    if (!firmaValida) throw new UnauthorizedException('La firma del evento no es válida');
    if (!transaccion) return { recibido: true };

    const intento = await this.prisma.intentoPago.findFirst({
      where: { referencia: transaccion.referencia, hotelId: hotel.id },
      select: { id: true },
    });
    if (!intento) {
      this.logger.warn(`Evento de una referencia desconocida: ${transaccion.referencia}`);
      return { recibido: true };
    }
    await this.aplicarResultado(intento.id, transaccion);
    return { recibido: true };
  }

  // Una sola lógica para el webhook y la reconciliación. El bloqueo del
  // intento la hace idempotente: el mismo evento dos veces (o a la vez, o en
  // desorden) crea un solo Pago.
  async aplicarResultado(intentoId: string, t: Transaccion) {
    if (t.estado === 'pendiente') return;
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM intento_pago WHERE id = ${intentoId} FOR UPDATE`;
      const intento = await tx.intentoPago.findUniqueOrThrow({ where: { id: intentoId } });
      if (intento.estado === 'aprobado') return;
      const ahora = this.reloj.ahora();

      if (t.estado === 'rechazada') {
        if (intento.estado === 'creado') {
          await tx.intentoPago.update({
            where: { id: intento.id },
            data: { estado: 'rechazado', idTransaccionProveedor: t.id },
          });
        }
        return;
      }

      // Aprobada: el monto tiene que ser el del intento.
      const centavos = Math.round(intento.monto.toNumber() * 100);
      if (t.montoEnCentavos !== centavos || t.moneda !== 'COP') {
        await this.alertar(tx, intento, t, ahora);
        return;
      }
      // El dinero ya entró: se registra aunque la reserva esté cerrada o
      // cancelada (queda como saldo a favor).
      const reserva = await bloquearReserva(tx, intento.hotelId, intento.reservaId);
      const tipo = reserva.estado === 'confirmada' ? 'anticipo' : 'abono';
      const datos = { tipo, medio: 'pasarela', monto: intento.monto, referencia: t.id } as const;
      const pago = await tx.pago.create({
        data: {
          ...datos,
          hotelId: intento.hotelId,
          reservaId: intento.reservaId,
          // Lo registra el sistema y no entra a ninguna caja: queda sin turno.
          usuarioId: null,
          fecha: ahora,
        },
      });
      await tx.intentoPago.update({
        where: { id: intento.id },
        data: { estado: 'aprobado', idTransaccionProveedor: t.id, pagoId: pago.id, alerta: null },
      });
      await tx.eventoReserva.create({
        data: {
          reservaId: intento.reservaId,
          tipo: 'pago_registrado',
          usuarioId: null,
          fecha: ahora,
          detalle: `${detallePago(datos)} · en línea (${intento.referencia})`,
          datos: { referencia: intento.referencia },
        },
      });
    });
  }

  // Un pago aprobado que no cuadra con el intento no se registra: queda una
  // alerta para revisarlo con la pasarela.
  private async alertar(
    tx: Prisma.TransactionClient,
    intento: IntentoPago,
    t: Transaccion,
    ahora: Date,
  ) {
    const alerta =
      `La pasarela reportó un pago de ${dinero(t.montoEnCentavos / 100)} ${t.moneda} ` +
      `(transacción ${t.id}) y el link era por ${dinero(intento.monto)}: no se registró`;
    if (intento.alerta === alerta) return;
    this.logger.warn(`Intento ${intento.referencia}: ${alerta}`);
    await tx.intentoPago.update({ where: { id: intento.id }, data: { alerta } });
    await tx.eventoReserva.create({
      data: {
        reservaId: intento.reservaId,
        tipo: 'alerta_pago_en_linea',
        usuarioId: null,
        fecha: ahora,
        detalle: alerta,
        datos: { referencia: intento.referencia, transaccion: t.id },
      },
    });
  }

  // Por si un webhook no llegó: cada 10 minutos se le pregunta a la pasarela
  // por los intentos pendientes de más de 15 minutos. Un link vencido sin
  // pago queda expirado.
  @Cron(CronExpression.EVERY_10_MINUTES)
  async reconciliar() {
    const ahora = this.reloj.ahora();
    const pendientes = await this.prisma.intentoPago.findMany({
      where: {
        estado: 'creado',
        creadoEn: { lte: new Date(ahora.getTime() - MINUTOS_ANTES_DE_RECONCILIAR * 60_000) },
      },
    });
    let resueltos = 0;
    for (const intento of pendientes) {
      try {
        const pasarela = await this.pasarelaDe(intento.hotelId);
        if (!pasarela || pasarela.proveedor !== intento.proveedor) continue;
        const transaccion = await pasarela.consultarTransaccion(intento.referencia);
        if (transaccion && transaccion.estado !== 'pendiente') {
          await this.aplicarResultado(intento.id, transaccion);
          resueltos++;
        } else if (ahora > intento.expiraEn) {
          await this.prisma.intentoPago.updateMany({
            where: { id: intento.id, estado: 'creado' },
            data: { estado: 'expirado' },
          });
          resueltos++;
        }
      } catch (error) {
        this.logger.warn(`No se pudo reconciliar ${intento.referencia}: ${String(error)}`);
      }
    }
    if (resueltos > 0) this.logger.log(`${resueltos} intento(s) de pago reconciliados`);
    return { revisados: pendientes.length, resueltos };
  }

  // ── Llaves del hotel ──────────────────────────────────────────────────

  async guardarLlaves(hotelId: string, llaves: LlavesWompi) {
    const limpias: LlavesWompi = {
      llavePublica: llaves.llavePublica.trim(),
      llavePrivada: llaves.llavePrivada.trim(),
      secretoEventos: llaves.secretoEventos.trim(),
      secretoIntegridad: llaves.secretoIntegridad.trim(),
    };
    const problema = problemaConLlaves(limpias);
    if (problema) throw new BadRequestException(problema);
    if (!llaveMaestra()) {
      throw new ConflictException(
        'El servidor no tiene CLAVE_CIFRADO_PAGOS: no se pueden guardar las llaves',
      );
    }
    const datos = {
      // problemaConLlaves solo deja pasar llaves de pruebas.
      ambiente: 'pruebas' satisfies Ambiente,
      llavePublica: cifrar(limpias.llavePublica),
      llavePrivada: cifrar(limpias.llavePrivada),
      secretoEventos: cifrar(limpias.secretoEventos),
      secretoIntegridad: cifrar(limpias.secretoIntegridad),
      actualizadoEn: this.reloj.ahora(),
    };
    await this.prisma.configuracionPasarela.upsert({
      where: { hotelId },
      create: { hotelId, ...datos },
      update: datos,
    });
    return this.estado(hotelId);
  }

  async probarConexion(hotelId: string) {
    const pasarela = await this.pasarelaDe(hotelId);
    if (!pasarela) throw new ConflictException(MENSAJE_SIN_LLAVES);
    return pasarela.probarConexion();
  }

  // ── Páginas públicas (sin sesión) ─────────────────────────────────────

  // La página de retorno: solo el estado, sin datos personales.
  async estadoPublico(referencia: string) {
    const intento = await this.prisma.intentoPago.findUnique({
      where: { referencia },
      select: { estado: true, monto: true, hotel: { select: { nombre: true } } },
    });
    if (!intento) throw new NotFoundException('Pago no encontrado');
    return { estado: intento.estado, monto: intento.monto, hotel: intento.hotel.nombre };
  }

  async pagoSimulado(referencia: string) {
    this.exigirSimulada();
    const intento = await this.prisma.intentoPago.findUnique({
      where: { referencia },
      select: {
        referencia: true,
        monto: true,
        estado: true,
        expiraEn: true,
        hotel: { select: { nombre: true } },
      },
    });
    if (!intento) throw new NotFoundException('Pago no encontrado');
    return { ...intento, hotel: intento.hotel.nombre };
  }

  // El botón de la página simulada: el evento firmado entra por el mismo
  // webhook (y la misma verificación) que usará Wompi. La página no crea pagos.
  async decidirPagoSimulado(referencia: string, aprobar: boolean) {
    this.exigirSimulada();
    const intento = await this.prisma.intentoPago.findUnique({
      where: { referencia },
      include: { hotel: { select: { slug: true } } },
    });
    if (!intento) throw new NotFoundException('Pago no encontrado');
    if (intento.estado !== 'creado') {
      throw new ConflictException('Este link de pago ya no está pendiente');
    }
    const evento = PasarelaSimulada.decidir(
      referencia,
      Math.round(intento.monto.toNumber() * 100),
      aprobar,
      this.reloj.ahora(),
    );
    await this.recibirWebhook(intento.hotel.slug, evento);
    return this.estadoPublico(referencia);
  }

  // ── Ayudantes ─────────────────────────────────────────────────────────

  private exigirSimulada() {
    if (proveedorActivo() !== 'simulada') throw new NotFoundException('Pago no encontrado');
  }

  // El adaptador del proveedor activo, con las llaves del hotel descifradas.
  // null si el proveedor es Wompi y el hotel no ha conectado su cuenta.
  private async pasarelaDe(hotelId: string): Promise<IPasarelaDePagos | null> {
    if (proveedorActivo() === 'simulada') return new PasarelaSimulada(urlPublicaApp());
    const config = await this.prisma.configuracionPasarela.findUnique({ where: { hotelId } });
    if (!config) return null;
    return new PasarelaWompi(
      {
        llavePublica: descifrar(config.llavePublica),
        llavePrivada: descifrar(config.llavePrivada),
        secretoEventos: descifrar(config.secretoEventos),
        secretoIntegridad: descifrar(config.secretoIntegridad),
      },
      config.ambiente as Ambiente,
    );
  }
}
