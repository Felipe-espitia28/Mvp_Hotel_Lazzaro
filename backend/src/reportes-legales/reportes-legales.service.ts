import { BadRequestException, Injectable } from '@nestjs/common';
import { Huesped, Ocupante } from '@prisma/client';
import { ContextoHotel } from '../auth/decoradores';
import { PrismaService } from '../prisma/prisma.service';
import { contarNoches, instanteDelHotel, fechaDelHotel, sumarDias } from '../hotel/politicas';
import { codigoMunicipio } from '../huespedes/divipola';
import { faltantesDePersona } from '../huespedes/datos-legales';
import { ORDEN_OCUPANTES } from '../reservas/huespedes-de-reserva';
import { FilaSire, FilaTra } from './columnas';

// Un reporte cubre como máximo un año: más es casi siempre un error al elegir fechas.
const DIAS_MAXIMOS = 366;

const dia = (fecha: Date) => fecha.toISOString().slice(0, 10);
const juntar = (...partes: (string | null)[]) => partes.filter((p) => p?.trim()).join(' ');

// Los extranjeros se reportan además a Migración Colombia (SIRE).
const esExtranjero = (h: Huesped) => h.nacionalidad !== null && h.nacionalidad !== 'CO';

const CON_OCUPANTES = {
  habitacion: true,
  ocupantes: { include: { huesped: true }, orderBy: ORDEN_OCUPANTES },
} as const;

// A-6: reportes para las plataformas oficiales (solo lectura). La TRA (MinCIT)
// lleva a todos los huéspedes; el SIRE (Migración), solo a los extranjeros,
// con un movimiento al entrar y otro al salir.
@Injectable()
export class ReportesLegalesService {
  constructor(private readonly prisma: PrismaService) {}

  private rango(desde: string, hasta: string) {
    const inicio = new Date(desde.slice(0, 10));
    const fin = new Date(hasta.slice(0, 10));
    if (fin < inicio) {
      throw new BadRequestException('La fecha "hasta" no puede ser anterior a "desde"');
    }
    if (contarNoches(inicio, fin) + 1 > DIAS_MAXIMOS) {
      throw new BadRequestException(`Un reporte cubre como máximo ${DIAS_MAXIMOS} días`);
    }
    return { inicio, fin };
  }

  // Estadías con check-in (activas o cerradas) cuya llegada cae en el rango.
  private estadias(hotelId: string, desde: string, hasta: string) {
    const { inicio, fin } = this.rango(desde, hasta);
    return this.prisma.reserva.findMany({
      where: {
        hotelId,
        estado: { in: ['activa', 'cerrada'] },
        fechaEntrada: { gte: inicio, lte: fin },
      },
      include: CON_OCUPANTES,
      orderBy: [{ fechaEntrada: 'asc' }, { habitacion: { numero: 'asc' } }],
    });
  }

  // TRA: una fila por ocupante; acompañantes y valor pagado solo en la del titular.
  async tra(hotel: ContextoHotel, desde: string, hasta: string): Promise<FilaTra[]> {
    const { tipoAlojamiento } = await this.prisma.hotel.findUniqueOrThrow({
      where: { id: hotel.id },
      select: { tipoAlojamiento: true },
    });
    const reservas = await this.estadias(hotel.id, desde, hasta);
    return reservas.flatMap((r) =>
      r.ocupantes.map(({ huesped: h, ...o }) => ({
        reservaId: r.id,
        titular: o.titular,
        tipoDocumento: h.tipoDocumento,
        documento: h.documento,
        nombres: juntar(h.primerNombre, h.segundoNombre),
        apellidos: juntar(h.primerApellido, h.segundoApellido),
        nacionalidad: h.nacionalidad ?? '',
        paisResidencia: h.paisResidencia ?? '',
        ciudadResidencia: h.ciudadResidencia ?? '',
        codigoCiudadResidencia:
          h.paisResidencia === 'CO' ? (codigoMunicipio(h.ciudadResidencia) ?? '') : '',
        paisProcedencia: o.paisProcedencia ?? '',
        ciudadProcedencia: o.ciudadProcedencia ?? '',
        codigoCiudadProcedencia:
          o.paisProcedencia === 'CO' ? (codigoMunicipio(o.ciudadProcedencia) ?? '') : '',
        habitacion: r.habitacion.numero,
        motivoViaje: r.motivoViaje ?? '',
        acompanantes: o.titular ? r.ocupantes.length - 1 : '',
        fechaEntrada: dia(r.fechaEntrada),
        fechaSalida: dia(r.fechaSalida),
        tipoAlojamiento,
        // Lo realmente pagado se conoce al liquidar el check-out (R23).
        valorPagado: o.titular && r.estado === 'cerrada' && r.total ? r.total.toFixed(0) : '',
      })),
    );
  }

  // SIRE: los extranjeros, con un movimiento por cada check-in (E) y cada
  // check-out (S) cuya fecha cae en el rango.
  async sire(hotel: ContextoHotel, desde: string, hasta: string): Promise<FilaSire[]> {
    const { inicio, fin } = this.rango(desde, hasta);
    const eventos = await this.prisma.eventoReserva.findMany({
      where: {
        reserva: { hotelId: hotel.id },
        tipo: { in: ['check_in', 'check_out'] },
        fecha: { gte: instanteDelHotel(inicio, 0), lt: instanteDelHotel(sumarDias(fin, 1), 0) },
      },
      include: { reserva: { include: CON_OCUPANTES } },
      orderBy: { fecha: 'asc' },
    });
    return eventos.flatMap((e) =>
      e.reserva.ocupantes
        .filter((o) => esExtranjero(o.huesped))
        .map(({ huesped: h }) => ({
          reservaId: e.reservaId,
          movimiento: e.tipo === 'check_in' ? ('E' as const) : ('S' as const),
          fecha: dia(fechaDelHotel(e.fecha)),
          tipoDocumento: h.tipoDocumento,
          documento: h.documento,
          apellidos: juntar(h.primerApellido, h.segundoApellido),
          nombres: juntar(h.primerNombre, h.segundoNombre),
          nacionalidad: h.nacionalidad ?? '',
          fechaNacimiento: h.fechaNacimiento ? dia(h.fechaNacimiento) : '',
        })),
    );
  }

  // Estadías del rango que no se pueden reportar completas (p. ej. las de
  // antes de registrar a cada ocupante), con lo que le falta a cada persona.
  async pendientes(hotel: ContextoHotel, desde: string, hasta: string) {
    const reservas = await this.estadias(hotel.id, desde, hasta);
    return reservas
      .map((r) => {
        const titular = r.ocupantes.find((o) => o.titular)?.huesped;
        const personas = r.ocupantes
          .map((o) => ({ nombre: o.huesped.nombre, faltan: faltantesDeOcupante(o) }))
          .filter((p) => p.faltan.length > 0);
        return {
          reservaId: r.id,
          habitacion: r.habitacion.numero,
          fechaEntrada: r.fechaEntrada,
          titular: titular
            ? {
                nombre: titular.nombre,
                tipoDocumento: titular.tipoDocumento,
                documento: titular.documento,
              }
            : null,
          personas:
            r.ocupantes.length === 0
              ? [{ nombre: 'Sin ocupantes', faltan: ['ocupantes'] }]
              : personas,
        };
      })
      .filter((r) => r.personas.length > 0);
  }
}

// R43: lo que le falta a un ocupante para el reporte (de la persona y de esta estadía).
function faltantesDeOcupante(o: Ocupante & { huesped: Huesped }) {
  const faltan = faltantesDePersona(o.huesped);
  if (!o.paisProcedencia) faltan.push('país de procedencia');
  if (!o.ciudadProcedencia) faltan.push('ciudad de procedencia');
  return faltan;
}
