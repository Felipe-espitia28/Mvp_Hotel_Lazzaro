import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma, TareaLimpieza } from '@prisma/client';
import { UsuarioAutenticado } from '../auth/decoradores';
import { PERMISOS, tienePermiso } from '../auth/permisos';
import { SELECCION_CONTEXTO, contextoDeHotel } from '../hotel/contexto';
import { fechaDelHotel, instanteDelHotel } from '../hotel/politicas';
import { Reloj } from '../hotel/reloj';
import { PrismaService } from '../prisma/prisma.service';
import { AccionTarea, CrearTareaDto, ListarTareasDto } from './limpieza.dto';

// Código de Prisma para violación de una restricción UNIQUE.
const CODIGO_PRISMA_UNICO = 'P2002';
// B-4: hora del hotel desde la que se crean los repasos del día.
const HORA_REPASO = 6;

const DETALLE_TAREA = {
  habitacion: { select: { id: true, numero: true, piso: true, estado: true } },
  asignadaA: { select: { id: true, nombre: true } },
} as const;

const ORDEN_ESTADO = { en_proceso: 0, pendiente: 1, terminada: 2 } as const;
const ORDEN_TIPO = { salida: 0, repaso: 1, profunda: 2 } as const;

const dia = (fecha: string) => new Date(`${fecha}T00:00:00Z`);

// B-4: las tareas de limpieza del día. Quien solo hace la limpieza (la
// camarera) ve las suyas y las sin asignar; quien asigna ve todas.
@Injectable()
export class LimpiezaService {
  private readonly logger = new Logger(LimpiezaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reloj: Reloj,
  ) {}

  async tareas(hotelId: string, filtro: ListarTareasDto, quien: UsuarioAutenticado) {
    const fecha = filtro.fecha ? dia(filtro.fecha) : fechaDelHotel(this.reloj.ahora());
    const veTodas = tienePermiso(quien.rol, PERMISOS.LIMPIEZA_ASIGNAR);
    const where: Prisma.TareaLimpiezaWhereInput = { hotelId, fecha };
    if (!veTodas) where.OR = [{ asignadaAId: quien.id }, { asignadaAId: null }];
    else if (filtro.asignadaA) where.asignadaAId = filtro.asignadaA;

    const tareas = (
      await this.prisma.tareaLimpieza.findMany({ where, include: DETALLE_TAREA })
    ).sort(
      (a, b) =>
        ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado] ||
        ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b.tipo] ||
        a.habitacion.numero.localeCompare(b.habitacion.numero, 'es', { numeric: true }),
    );
    const terminadas = tareas.filter((t) => t.estado === 'terminada').length;
    return {
      fecha,
      tareas,
      avance: {
        total: tareas.length,
        terminadas,
        porcentaje: tareas.length === 0 ? 0 : Math.round((terminadas / tareas.length) * 100),
      },
    };
  }

  personal(hotelId: string) {
    return this.prisma.usuario.findMany({
      where: { hotelId, activo: true },
      select: { id: true, nombre: true, rol: true },
      orderBy: { nombre: 'asc' },
    });
  }

  // Una tarea a mano (limpieza profunda o un repaso extra). Única por
  // habitación, día y tipo.
  async crear(hotelId: string, dto: CrearTareaDto) {
    const habitacion = await this.prisma.habitacion.findFirst({
      where: { id: dto.habitacionId, hotelId },
    });
    if (!habitacion) throw new NotFoundException('Habitación no encontrada');
    if (dto.asignadaAId) await this.exigirPersonal(hotelId, dto.asignadaAId);
    const ahora = this.reloj.ahora();
    try {
      return await this.prisma.tareaLimpieza.create({
        data: {
          hotelId,
          habitacionId: habitacion.id,
          fecha: dto.fecha ? dia(dto.fecha) : fechaDelHotel(ahora),
          tipo: dto.tipo,
          asignadaAId: dto.asignadaAId ?? null,
          creadaEn: ahora,
        },
        include: DETALLE_TAREA,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === CODIGO_PRISMA_UNICO
      ) {
        throw new ConflictException(
          `La habitación ${habitacion.numero} ya tiene una tarea de ese tipo ese día`,
        );
      }
      throw error;
    }
  }

  // En lote y todo o nada: si una tarea no es del hotel, no se asigna ninguna.
  async asignar(hotelId: string, tareaIds: string[], usuarioId: string | null) {
    if (usuarioId) await this.exigirPersonal(hotelId, usuarioId);
    return this.prisma.$transaction(async (tx) => {
      const ids = [...new Set(tareaIds)];
      const tareas = await tx.tareaLimpieza.findMany({ where: { id: { in: ids }, hotelId } });
      if (tareas.length !== ids.length) throw new NotFoundException('Tarea no encontrada');
      if (tareas.some((t) => t.estado === 'terminada')) {
        throw new BadRequestException('Una de las tareas ya está terminada: no se asignó ninguna');
      }
      const { count } = await tx.tareaLimpieza.updateMany({
        where: { id: { in: ids } },
        data: { asignadaAId: usuarioId },
      });
      return { asignadas: count };
    });
  }

  // Iniciar o terminar. Terminar una "salida" deja la habitación libre, solo
  // si sigue en limpieza (si mientras tanto salió de servicio, se queda así).
  async avanzar(
    hotelId: string,
    id: string,
    accion: AccionTarea,
    observaciones: string | undefined,
    quien: UsuarioAutenticado,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM tarea_limpieza WHERE id = ${id} AND hotel_id = ${hotelId} FOR UPDATE`;
      const tarea = await tx.tareaLimpieza.findFirst({ where: { id, hotelId } });
      if (!tarea) throw new NotFoundException('Tarea no encontrada');
      this.exigirQuePuedaHacerla(tarea, quien);
      const ahora = this.reloj.ahora();

      if (accion === 'iniciar') {
        if (tarea.estado !== 'pendiente') {
          throw new ConflictException('La tarea ya se inició');
        }
        return tx.tareaLimpieza.update({
          where: { id },
          // Una tarea sin asignar es de quien la empieza.
          data: { estado: 'en_proceso', inicio: ahora, asignadaAId: tarea.asignadaAId ?? quien.id },
          include: DETALLE_TAREA,
        });
      }

      if (tarea.estado === 'terminada') throw new ConflictException('La tarea ya está terminada');
      if (tarea.tipo === 'salida') {
        await tx.habitacion.updateMany({
          where: { id: tarea.habitacionId, estado: 'en_limpieza' },
          data: { estado: 'libre' },
        });
      }
      return tx.tareaLimpieza.update({
        where: { id },
        data: {
          estado: 'terminada',
          inicio: tarea.inicio ?? ahora,
          fin: ahora,
          asignadaAId: tarea.asignadaAId ?? quien.id,
          observaciones: observaciones?.trim() || tarea.observaciones,
        },
        include: DETALLE_TAREA,
      });
    });
  }

  // Cada 10 minutos, para todos los hoteles: desde las 6:00 de cada hotel con
  // el repaso diario activo, un repaso por habitación ocupada. El índice
  // único hace que correr de nuevo no duplique nada.
  @Cron(CronExpression.EVERY_10_MINUTES)
  async generarRepasos() {
    const ahora = this.reloj.ahora();
    const hoy = fechaDelHotel(ahora);
    if (ahora < instanteDelHotel(hoy, HORA_REPASO)) return { creados: 0 };
    const hoteles = await this.prisma.hotel.findMany({
      where: { activo: true },
      select: SELECCION_CONTEXTO,
    });
    let creados = 0;
    for (const hotel of hoteles) {
      if (!contextoDeHotel(hotel).politicas.repasoDiario) continue;
      const ocupadas = await this.prisma.habitacion.findMany({
        where: { hotelId: hotel.id, estado: 'ocupada' },
        select: { id: true },
      });
      const { count } = await this.prisma.tareaLimpieza.createMany({
        data: ocupadas.map((h) => ({
          hotelId: hotel.id,
          habitacionId: h.id,
          fecha: hoy,
          tipo: 'repaso' as const,
          creadaEn: ahora,
        })),
        skipDuplicates: true,
      });
      creados += count;
    }
    if (creados > 0) this.logger.log(`${creados} repaso(s) de limpieza creados`);
    return { creados };
  }

  // ── Ayudantes ─────────────────────────────────────────────────────────

  // La camarera solo hace las suyas o las que nadie tiene; quien asigna, cualquiera.
  private exigirQuePuedaHacerla(tarea: TareaLimpieza, quien: UsuarioAutenticado) {
    if (tienePermiso(quien.rol, PERMISOS.LIMPIEZA_ASIGNAR)) return;
    if (tarea.asignadaAId && tarea.asignadaAId !== quien.id) {
      throw new ForbiddenException('Esta tarea está asignada a otra persona');
    }
  }

  private async exigirPersonal(hotelId: string, usuarioId: string) {
    const usuario = await this.prisma.usuario.findFirst({
      where: { id: usuarioId, hotelId, activo: true },
      select: { id: true },
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');
  }
}
