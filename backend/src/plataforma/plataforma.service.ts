import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Reloj } from '../hotel/reloj';
import { fechaDelHotel } from '../hotel/politicas';
import { UsuariosService, credencialesTemporales } from '../usuarios/usuarios.service';
import { TEMPORADAS_INICIALES, TIPOS_INICIALES } from '../hotel/datos-iniciales';
import { crearRolesIniciales } from '../roles/gobierno';
import { crearCatalogoInicial } from '../servicios/catalogo-inicial';
import { ActualizarHotelDto, CrearHotelDto } from './plataforma.dto';

const CODIGO_PRISMA_UNICO = 'P2002';

const CAMPOS_RESUMEN = {
  id: true,
  slug: true,
  nombre: true,
  ciudad: true,
  activo: true,
  logo: true,
  colorPrimario: true,
  colorAcento: true,
  createdAt: true,
} as const;

// Consola Lazaro: el equipo de Lazaro da de alta los hoteles que compran el
// módulo, les da acceso a su gente y puede suspenderlos.
@Injectable()
export class PlataformaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reloj: Reloj,
    private readonly usuarios: UsuariosService,
  ) {}

  // Hoteles con indicadores para el seguimiento comercial: habitaciones,
  // personas con acceso, ocupación de esta noche y reservas creadas en el mes.
  async listar() {
    const hoy = fechaDelHotel(this.reloj.ahora());
    const inicioMes = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1));

    const [hoteles, ocupadas, delMes] = await Promise.all([
      this.prisma.hotel.findMany({
        select: {
          ...CAMPOS_RESUMEN,
          _count: { select: { habitaciones: true, usuarios: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.reserva.groupBy({
        by: ['hotelId'],
        where: {
          estado: { in: ['confirmada', 'activa'] },
          fechaEntrada: { lte: hoy },
          fechaSalida: { gt: hoy },
        },
        _count: { _all: true },
      }),
      this.prisma.reserva.groupBy({
        by: ['hotelId'],
        where: { createdAt: { gte: inicioMes } },
        _count: { _all: true },
      }),
    ]);

    const cuenta = (grupos: typeof ocupadas, hotelId: string) =>
      grupos.find((g) => g.hotelId === hotelId)?._count._all ?? 0;

    return hoteles.map(({ _count, ...hotel }) => ({
      ...hotel,
      habitaciones: _count.habitaciones,
      usuarios: _count.usuarios,
      ocupadasEstaNoche: cuenta(ocupadas, hotel.id),
      reservasDelMes: cuenta(delMes, hotel.id),
    }));
  }

  async detalle(id: string) {
    const hotel = await this.prisma.hotel.findUnique({
      where: { id },
      select: { ...CAMPOS_RESUMEN, nit: true, telefono: true, eslogan: true },
    });
    if (!hotel) {
      throw new NotFoundException('Hotel no encontrado');
    }
    return hotel;
  }

  // Alta completa en una sola transacción: el hotel, sus tipos de habitación
  // de partida y las personas con acceso. Si algo falla, no queda nada a medias.
  async crear(dto: CrearHotelDto, actorId: string) {
    // R78: el hotel nace con alguien que gobierne su equipo y sus roles.
    if (!dto.personas.some((p) => p.plantilla === 'Administrador')) {
      throw new BadRequestException(
        'El hotel necesita al menos un administrador para manejar su Gerencia',
      );
    }
    const correos = dto.personas.map((p) => p.email);
    if (new Set(correos).size !== correos.length) {
      throw new BadRequestException('Hay correos repetidos entre las personas');
    }

    // R70: cada persona recibe su contraseña temporal por correo.
    const { personas, ...datosHotel } = dto;
    const ahora = this.reloj.ahora();
    const conTemporal = await Promise.all(
      personas.map(async (p) => ({ persona: p, ...(await credencialesTemporales(ahora)) })),
    );

    try {
      // El hotel nace con su catálogo de servicios sugerido, todo o nada.
      const hotel = await this.prisma.$transaction(async (tx) => {
        const creado = await tx.hotel.create({
          data: {
            ...datosHotel,
            tipos: { create: TIPOS_INICIALES },
            temporadas: { create: TEMPORADAS_INICIALES },
          },
          select: { id: true },
        });
        // Plan 19: nace con los roles de las plantillas; cada persona, con el suyo.
        const roles = await crearRolesIniciales(tx, creado.id);
        const usuarios = [];
        for (const { persona, datos } of conTemporal) {
          usuarios.push(
            await tx.usuario.create({
              data: {
                hotelId: creado.id,
                nombre: persona.nombre,
                email: persona.email,
                tipo: 'hotel',
                rolId: roles[persona.plantilla],
                ...datos,
              },
              select: { id: true, email: true },
            }),
          );
        }
        await crearCatalogoInicial(tx, creado.id);
        await tx.eventoUsuario.createMany({
          data: usuarios.map((u) => ({
            usuarioId: u.id,
            actorId,
            tipo: 'creado' as const,
            fecha: ahora,
          })),
        });
        return { id: creado.id, usuarios };
      });
      // Los correos salen después de la transacción; uno que falla no
      // deshace el alta: se le reenvían las credenciales desde la Consola.
      const correosFallidos: string[] = [];
      for (const { persona, temporal, venceEn } of conTemporal) {
        const usuario = hotel.usuarios.find((u) => u.email === persona.email)!;
        const enviado = await this.usuarios.enviarCredenciales(
          { id: usuario.id, nombre: persona.nombre, email: persona.email, hotelId: hotel.id },
          { temporal, venceEn, reenvio: false },
          actorId,
        );
        if (!enviado) correosFallidos.push(persona.email);
      }
      return { ...(await this.detalle(hotel.id)), correosFallidos };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === CODIGO_PRISMA_UNICO
      ) {
        const campos = String(error.meta?.target ?? '');
        throw new ConflictException(
          campos.includes('slug')
            ? `Ya existe un hotel con el identificador "${dto.slug}"`
            : 'Alguno de los correos ya tiene acceso a la plataforma',
        );
      }
      throw error;
    }
  }

  async actualizar(id: string, dto: ActualizarHotelDto) {
    await this.detalle(id);
    await this.prisma.hotel.update({ where: { id }, data: dto });
    return this.detalle(id);
  }
}
