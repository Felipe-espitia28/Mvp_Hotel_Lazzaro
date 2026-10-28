import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ContextoHotel, UsuarioAutenticado } from '../auth/decoradores';
import { turnoAbiertoDe } from '../caja/turno-abierto';
import {
  FolioService,
  bloquearReserva,
  detallePago,
  dinero,
  dividirCuenta,
  exigirMedioDelHotel,
  subcuentasDe,
} from '../folio/folio.service';
import { fechaDelHotel, sumarDias } from '../hotel/politicas';
import { Reloj } from '../hotel/reloj';
import { PrismaService } from '../prisma/prisma.service';
import {
  AbonoEmpresaDto,
  ActualizarEmpresaDto,
  AsignarEmpresaDto,
  CrearEmpresaDto,
} from './empresas.dto';
import { NitInvalidoError, normalizarNit } from './nit';

// Código de Prisma para violación de una restricción UNIQUE.
const CODIGO_PRISMA_UNICO = 'P2002';
const ESTADOS_TERMINADOS = ['cerrada', 'cancelada', 'no_show'];

// B-5: cuentas empresa. La empresa paga el alojamiento (o todo) de sus
// reservas; su subcuenta puede quedar a crédito y se cobra con un abono
// repartido entre varias reservas.
@Injectable()
export class EmpresasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reloj: Reloj,
    private readonly folio: FolioService,
  ) {}

  // Por razón social o por NIT (con o sin puntos).
  buscar(hotelId: string, texto?: string) {
    const termino = texto?.trim();
    const digitos = termino?.replace(/[\s.-]/g, '');
    return this.prisma.empresa.findMany({
      where: {
        hotelId,
        ...(termino && {
          OR: [
            { razonSocial: { contains: termino, mode: 'insensitive' } },
            ...(digitos && /^\d+$/.test(digitos) ? [{ nit: { startsWith: digitos } }] : []),
          ],
        }),
      },
      orderBy: { razonSocial: 'asc' },
      take: 50,
    });
  }

  async crear(hotelId: string, dto: CrearEmpresaDto) {
    return this.guardar(() =>
      this.prisma.empresa.create({
        data: {
          hotelId,
          ...this.leerNit(dto.nit),
          razonSocial: dto.razonSocial.trim(),
          email: dto.email,
          telefono: dto.telefono?.trim() || null,
          credito: dto.credito ?? false,
          diasCredito: dto.diasCredito ?? null,
        },
      }),
    );
  }

  async actualizar(hotelId: string, id: string, dto: ActualizarEmpresaDto) {
    await this.exigirEmpresa(hotelId, id);
    return this.guardar(() =>
      this.prisma.empresa.update({
        where: { id },
        data: {
          ...(dto.nit !== undefined && this.leerNit(dto.nit)),
          ...(dto.razonSocial !== undefined && { razonSocial: dto.razonSocial.trim() }),
          ...(dto.email !== undefined && { email: dto.email }),
          ...(dto.telefono !== undefined && { telefono: dto.telefono.trim() || null }),
          ...(dto.credito !== undefined && { credito: dto.credito }),
          ...(dto.diasCredito !== undefined && { diasCredito: dto.diasCredito }),
        },
      }),
    );
  }

  // Asignar, cambiar o quitar la empresa de una reserva (antes de llegar o
  // con la estadía en curso). Los cargos vigentes se reubican con la regla.
  async asignar(
    hotel: ContextoHotel,
    reservaId: string,
    dto: AsignarEmpresaDto,
    quien: UsuarioAutenticado,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const reserva = await bloquearReserva(tx, hotel.id, reservaId);
      if (reserva.estado !== 'confirmada' && reserva.estado !== 'activa') {
        throw new BadRequestException(
          `La empresa se asigna antes del check-out (la reserva está "${reserva.estado}")`,
        );
      }
      const empresa = dto.empresaId ? await this.exigirEmpresa(hotel.id, dto.empresaId, tx) : null;
      if (!empresa) {
        const pagosEmpresa = await tx.pago.count({
          where: { reservaId, responsable: 'empresa', anulado: false },
        });
        if (pagosEmpresa > 0) {
          throw new ConflictException(
            'La empresa ya tiene pagos en esta reserva: anúlalos antes de quitarla',
          );
        }
      }
      const regla = dto.reglaEmpresa ?? 'alojamiento';
      await tx.reserva.update({
        where: { id: reservaId },
        data: { empresaId: empresa?.id ?? null, reglaEmpresa: regla },
      });
      const { count } = await tx.cargo.updateMany({
        where: { reservaId, anulado: false },
        data: { responsable: empresa && regla === 'todo' ? 'empresa' : 'huesped' },
      });
      await tx.eventoReserva.create({
        data: {
          reservaId,
          tipo: 'empresa_asignada',
          usuarioId: quien.id,
          fecha: this.reloj.ahora(),
          detalle: empresa
            ? `Paga ${empresa.razonSocial} (${regla === 'todo' ? 'todo' : 'el alojamiento'})${
                count > 0 ? ` · ${count} consumo(s) reubicados` : ''
              }`
            : 'Sin empresa: paga el huésped',
          datos: { empresaId: empresa?.id ?? null, regla },
        },
      });
    });
    return this.folio.folio(hotel.id, reservaId);
  }

  // Un pago de la empresa repartido entre varias de sus reservas: todo o nada.
  async abonar(
    hotel: ContextoHotel,
    empresaId: string,
    dto: AbonoEmpresaDto,
    quien: UsuarioAutenticado,
  ) {
    exigirMedioDelHotel(hotel, dto.medio);
    const empresa = await this.exigirEmpresa(hotel.id, empresaId);
    const ids = dto.pagos.map((p) => p.reservaId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Cada reserva va una sola vez en el abono');
    }

    return this.prisma.$transaction(async (tx) => {
      const ahora = this.reloj.ahora();
      const turnoId = await turnoAbiertoDe(tx, quien.id);
      // En orden de id: dos abonos que comparten reservas no se interbloquean.
      const pagos = [...dto.pagos].sort((a, b) => a.reservaId.localeCompare(b.reservaId));
      for (const { reservaId, monto } of pagos) {
        const reserva = await bloquearReserva(tx, hotel.id, reservaId);
        if (reserva.empresaId !== empresa.id) {
          throw new BadRequestException(`Una de las reservas no es de ${empresa.razonSocial}`);
        }
        const { saldo } = (await subcuentasDe(tx, reserva)).empresa;
        if (monto > saldo) {
          throw new BadRequestException(
            `El abono de ${dinero(monto)} supera lo que ${empresa.razonSocial} debe en una de las reservas (${dinero(Math.max(0, saldo))}): no se registró nada`,
          );
        }
        const datos = {
          tipo: reserva.estado === 'confirmada' ? ('anticipo' as const) : ('abono' as const),
          medio: dto.medio,
          monto,
          referencia: dto.referencia,
          responsable: 'empresa' as const,
        };
        await tx.pago.create({
          data: {
            ...datos,
            hotelId: hotel.id,
            reservaId,
            usuarioId: quien.id,
            turnoId,
            fecha: ahora,
          },
        });
        await tx.eventoReserva.create({
          data: {
            reservaId,
            tipo: 'pago_registrado',
            usuarioId: quien.id,
            fecha: ahora,
            detalle: `${detallePago(datos)} · abono de ${empresa.razonSocial}`,
          },
        });
      }
      return {
        pagos: pagos.length,
        total: pagos.reduce((s, p) => s + p.monto, 0),
      };
    });
  }

  // Lo que la empresa debe, reserva por reserva, con el vencimiento de las
  // terminadas (salida + días de crédito).
  async estadoDeCuenta(hotelId: string, empresaId: string) {
    const empresa = await this.exigirEmpresa(hotelId, empresaId);
    const reservas = await this.prisma.reserva.findMany({
      where: { hotelId, empresaId },
      include: {
        habitacion: { select: { numero: true } },
        huesped: { select: { nombre: true } },
        cargos: { select: { total: true, responsable: true, anulado: true } },
        pagos: { select: { tipo: true, monto: true, anulado: true, responsable: true } },
      },
      orderBy: { fechaEntrada: 'desc' },
    });
    const hoy = fechaDelHotel(this.reloj.ahora());
    const filas = reservas.map((r) => {
      const cuenta = dividirCuenta(r, r.cargos, r.pagos).empresa;
      const vencimiento =
        ESTADOS_TERMINADOS.includes(r.estado) && empresa.diasCredito !== null
          ? sumarDias(r.fechaSalida, empresa.diasCredito)
          : null;
      return {
        reservaId: r.id,
        estado: r.estado,
        habitacion: r.habitacion.numero,
        huesped: r.huesped.nombre,
        fechaEntrada: r.fechaEntrada,
        fechaSalida: r.fechaSalida,
        ...cuenta,
        vencimiento,
        vencida: vencimiento !== null && vencimiento < hoy && cuenta.saldo > 0,
      };
    });
    const suma = (f: (fila: (typeof filas)[number]) => number) =>
      Math.round(filas.reduce((s, x) => s + f(x), 0) * 100) / 100;
    return {
      empresa,
      reservas: filas,
      totales: {
        debe: suma((f) => f.debe),
        pagado: suma((f) => f.pagado - f.reembolsado),
        saldo: suma((f) => f.saldo),
        vencido: suma((f) => (f.vencida ? f.saldo : 0)),
      },
    };
  }

  // ── Ayudantes ─────────────────────────────────────────────────────────

  private leerNit(texto: string) {
    try {
      return normalizarNit(texto);
    } catch (error) {
      if (error instanceof NitInvalidoError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  private async guardar<T>(operacion: () => Promise<T>) {
    try {
      return await operacion();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === CODIGO_PRISMA_UNICO
      ) {
        throw new ConflictException('Ya hay una empresa con ese NIT en el hotel');
      }
      throw error;
    }
  }

  private async exigirEmpresa(
    hotelId: string,
    id: string,
    cliente: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const empresa = await cliente.empresa.findFirst({ where: { id, hotelId } });
    if (!empresa) throw new NotFoundException('Empresa no encontrada');
    return empresa;
  }
}
