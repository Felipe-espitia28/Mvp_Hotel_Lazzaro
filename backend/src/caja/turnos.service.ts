import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Turno } from '@prisma/client';
import { ContextoHotel, UsuarioAutenticado } from '../auth/decoradores';
import { PERMISOS, tienePermiso } from '../auth/permisos';
import { PrismaService } from '../prisma/prisma.service';
import { Reloj } from '../hotel/reloj';
import { fechaDelHotel, instanteDelHotel, sumarDias } from '../hotel/politicas';
import { esViolacionDeNoSobreventa } from '../reservas/reservas.service';
import { AbrirTurnoDto, CerrarTurnoDto } from './turnos.dto';
import { ResumenTurno, diferenciaDeCaja, resumenTurno } from './resumen-turno';

type Cliente = Prisma.TransactionClient | PrismaService;

const DIAS_HISTORIAL_POR_DEFECTO = 30;
const CON_USUARIO = { usuario: { select: { id: true, nombre: true } } } as const;

// B-3: turnos de caja. El turno no bloquea la operación: sin turno abierto se
// puede registrar un pago, que queda "sin turno" y va al aviso del admin.
@Injectable()
export class TurnosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reloj: Reloj,
  ) {}

  async abrir(hotel: ContextoHotel, dto: AbrirTurnoDto, quien: UsuarioAutenticado) {
    const abierto = await this.prisma.turno.findFirst({
      where: { usuarioId: quien.id, cerradoEn: null },
    });
    if (abierto) throw this.yaAbierto();
    try {
      const turno = await this.prisma.turno.create({
        data: {
          hotelId: hotel.id,
          usuarioId: quien.id,
          abiertoEn: this.reloj.ahora(),
          baseEfectivo: dto.baseEfectivo,
        },
        include: CON_USUARIO,
      });
      return this.conResumen(this.prisma, turno);
    } catch (error) {
      // Dos aperturas simultáneas: la restricción turno_uno_abierto_por_usuario deja una.
      if (esViolacionDeNoSobreventa(error)) throw this.yaAbierto();
      throw error;
    }
  }

  async actual(quien: UsuarioAutenticado) {
    const turno = await this.prisma.turno.findFirst({
      where: { usuarioId: quien.id, cerradoEn: null },
      include: CON_USUARIO,
    });
    return turno ? this.conResumen(this.prisma, turno) : null;
  }

  // Calcula el cuadre y lo congela. El bloqueo del turno ordena el cierre con
  // los pagos que llegan a la vez (ver turnoAbiertoDe).
  async cerrar(hotel: ContextoHotel, id: string, dto: CerrarTurnoDto, quien: UsuarioAutenticado) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM turno WHERE id = ${id} AND hotel_id = ${hotel.id} FOR UPDATE`;
      const turno = await tx.turno.findFirst({ where: { id, hotelId: hotel.id } });
      if (!turno) throw new NotFoundException('Turno no encontrado');
      if (turno.usuarioId !== quien.id && !tienePermiso(quien.rol, PERMISOS.CAJA_SUPERVISAR)) {
        throw new ForbiddenException('Solo puedes cerrar tu propio turno');
      }
      if (turno.cerradoEn) throw new ConflictException('El turno ya está cerrado');

      const resumen = await this.resumenVivo(tx, turno);
      const cierre = {
        ...resumen,
        efectivoContado: dto.efectivoContado,
        diferencia: diferenciaDeCaja(dto.efectivoContado, resumen.esperadoEfectivo),
      };
      const cerrado = await tx.turno.update({
        where: { id },
        data: {
          cerradoEn: this.reloj.ahora(),
          efectivoContado: dto.efectivoContado,
          observaciones: dto.observaciones?.trim() || null,
          resumenCierre: cierre as unknown as Prisma.InputJsonObject,
        },
        include: CON_USUARIO,
      });
      return { ...cerrado, resumen: cierre };
    });
  }

  // El admin ve todos los turnos del hotel; recepción, solo los suyos.
  async listar(
    hotel: ContextoHotel,
    quien: UsuarioAutenticado,
    desdeTexto?: string,
    hastaTexto?: string,
    usuarioId?: string,
  ) {
    const supervisa = tienePermiso(quien.rol, PERMISOS.CAJA_SUPERVISAR);
    const hoy = fechaDelHotel(this.reloj.ahora());
    const desde = desdeTexto
      ? new Date(desdeTexto.slice(0, 10))
      : sumarDias(hoy, -DIAS_HISTORIAL_POR_DEFECTO);
    const hasta = hastaTexto ? new Date(hastaTexto.slice(0, 10)) : hoy;
    const turnos = await this.prisma.turno.findMany({
      where: {
        hotelId: hotel.id,
        usuarioId: supervisa ? usuarioId : quien.id,
        abiertoEn: {
          gte: instanteDelHotel(desde, 0),
          lt: instanteDelHotel(sumarDias(hasta, 1), 0),
        },
      },
      include: CON_USUARIO,
      orderBy: { abiertoEn: 'desc' },
    });
    return Promise.all(turnos.map((t) => this.conResumen(this.prisma, t)));
  }

  // B-3: lo que se hizo sin turno abierto desde que el hotel abrió su primer
  // turno (antes de usar los turnos, todo era "sin turno"): pagos registrados
  // y anulaciones.
  async sinTurno(hotelId: string) {
    const primero = await this.prisma.turno.findFirst({
      where: { hotelId },
      orderBy: { abiertoEn: 'asc' },
      select: { abiertoEn: true },
    });
    if (!primero) return { desde: null, pagos: [], anulaciones: [] };
    const detalle = {
      usuario: { select: { nombre: true } },
      anuladoPor: { select: { nombre: true } },
      reserva: { select: { id: true, huesped: { select: { nombre: true, documento: true } } } },
      cita: { select: { concepto: true, huesped: { select: { nombre: true } } } },
      cupo: { select: { concepto: true, huesped: { select: { nombre: true } } } },
    } as const;
    const [pagos, anulaciones] = await Promise.all([
      this.prisma.pago.findMany({
        where: {
          hotelId,
          turnoId: null,
          usuarioId: { not: null },
          fecha: { gte: primero.abiertoEn },
        },
        include: detalle,
        orderBy: { fecha: 'desc' },
      }),
      this.prisma.pago.findMany({
        where: {
          hotelId,
          anulado: true,
          anuladoTurnoId: null,
          anuladoEn: { gte: primero.abiertoEn },
        },
        include: detalle,
        orderBy: { anuladoEn: 'desc' },
      }),
    ]);
    return { desde: primero.abiertoEn, pagos, anulaciones };
  }

  // ── Ayudantes ─────────────────────────────────────────────────────────

  private async resumenVivo(cliente: Cliente, turno: Turno): Promise<ResumenTurno> {
    const pagos = await cliente.pago.findMany({
      where: { OR: [{ turnoId: turno.id }, { anuladoTurnoId: turno.id }] },
      select: {
        tipo: true,
        medio: true,
        monto: true,
        turnoId: true,
        anulado: true,
        anuladoTurnoId: true,
      },
    });
    return resumenTurno(
      turno.id,
      turno.baseEfectivo.toNumber(),
      pagos.map((p) => ({ ...p, monto: p.monto.toNumber() })),
    );
  }

  // Abierto: el cuadre en vivo. Cerrado: el que se congeló al cerrar.
  private async conResumen<T extends Turno>(cliente: Cliente, turno: T) {
    const resumen = turno.cerradoEn
      ? (turno.resumenCierre as unknown as ResumenTurno & {
          efectivoContado: number;
          diferencia: number;
        })
      : await this.resumenVivo(cliente, turno);
    return { ...turno, resumen };
  }

  private yaAbierto() {
    return new ConflictException('Ya tienes un turno abierto: ciérralo antes de abrir otro');
  }
}
