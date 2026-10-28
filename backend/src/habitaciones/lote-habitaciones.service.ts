import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TipoHabitacion } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Reloj } from '../hotel/reloj';
import { fechaDelHotel } from '../hotel/politicas';
import {
  FilaInforme,
  LIMITE_FILAS,
  aEntero,
  aTexto,
  armarInforme,
  esFilaVacia,
  normalizarFila,
} from '../importacion/importacion';
import { aCsv } from '../reportes-legales/csv';
import { CrearRangoDto } from './dto/lote.dto';
import { EstadoManual } from './dto/cambiar-estado.dto';
import { numerosDelRango, pisoDelNumero } from './piso';
import { exigirSinHuesped, reservasFuturas, reservasQueNoCaben } from './reglas-habitacion';
import { cerrarTareasSalida } from '../limpieza/tareas-de-limpieza';

const CODIGO_PRISMA_UNICO = 'P2002';
const LARGO_NUMERO = 20;
const LARGO_DESCRIPCION = 200;

// Encabezados que se aceptan en el archivo para cada columna (se comparan
// sin tildes, mayúsculas ni espacios).
const ALIAS = {
  numero: ['número', 'num', 'no', 'nº', 'habitación', 'número de habitación'],
  tipo: ['código del tipo', 'tipo de habitación', 'código', 'codigo tipo'],
  piso: ['nivel'],
  descripcion: ['descripción', 'notas', 'observaciones'],
};

// A-4 / R52: operaciones de muchas habitaciones a la vez. Todas van en una
// transacción (todo o nada) y nunca borran: si una habitación no cumple una
// regla, no cambia ninguna.
@Injectable()
export class LoteHabitacionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reloj: Reloj,
  ) {}

  private hoy() {
    return fechaDelHotel(this.reloj.ahora());
  }

  async crearRango(hotelId: string, dto: CrearRangoDto) {
    if (Number(dto.hasta) < Number(dto.desde)) {
      throw new BadRequestException('"hasta" debe ser mayor o igual que "desde"');
    }
    const numeros = numerosDelRango(dto.desde, dto.hasta);
    if (numeros.length > LIMITE_FILAS) {
      throw new BadRequestException(`Un rango admite hasta ${LIMITE_FILAS} habitaciones`);
    }
    const tipo = await this.exigirTipo(hotelId, dto.tipoId);
    const datos = numeros.map((n) => ({
      hotelId,
      numero: (dto.prefijo ?? '') + n,
      tipoHabitacionId: tipo.id,
      piso: dto.piso ?? pisoDelNumero(n),
    }));

    return this.conDuplicadosComoConflicto(() =>
      this.prisma.$transaction(async (tx) => {
        const existentes = await tx.habitacion.findMany({
          where: { hotelId, numero: { in: datos.map((d) => d.numero) } },
          orderBy: { numero: 'asc' },
        });
        if (existentes.length > 0) {
          throw new ConflictException(
            `Ya existen las habitaciones ${existentes.map((h) => h.numero).join(', ')}: no se creó ninguna`,
          );
        }
        await tx.habitacion.createMany({ data: datos });
        return { creadas: datos.length, numeros: datos.map((d) => d.numero) };
      }),
    );
  }

  // Cada fila crea una habitación o, si su número ya existe, actualiza el
  // tipo, el piso y la descripción (una celda vacía no borra lo que había).
  async importar(hotelId: string, filasCrudas: Record<string, unknown>[], soloValidar: boolean) {
    const tipos = await this.prisma.tipoHabitacion.findMany({ where: { hotelId } });
    const porCodigo = new Map(tipos.map((t) => [t.codigo.toLowerCase(), t]));
    // La fila 1 del archivo son los encabezados.
    const leidas = filasCrudas
      .map((f, i) => ({ fila: i + 2, datos: normalizarFila(f, ALIAS) }))
      .filter((f) => !esFilaVacia(f.datos));
    if (leidas.length === 0) {
      throw new BadRequestException('El archivo no tiene filas con datos');
    }

    return this.conDuplicadosComoConflicto(() =>
      this.prisma.$transaction(async (tx) => {
        const hoy = this.hoy();
        const existentes = await tx.habitacion.findMany({
          where: { hotelId, numero: { in: leidas.map((l) => aTexto(l.datos.numero)) } },
        });
        const porNumero = new Map(existentes.map((h) => [h.numero, h]));

        const vistos = new Map<string, number>();
        const filas = leidas.map(({ fila, datos }) => {
          const numero = aTexto(datos.numero);
          const codigo = aTexto(datos.tipo);
          const piso = aEntero(datos.piso);
          const descripcion = aTexto(datos.descripcion);
          const tipo = porCodigo.get(codigo.toLowerCase());
          const errores: string[] = [];

          if (!numero) errores.push('Falta el número');
          else if (numero.length > LARGO_NUMERO) {
            errores.push(`El número admite hasta ${LARGO_NUMERO} caracteres`);
          } else if (vistos.has(numero)) {
            errores.push(
              `El número ${numero} está repetido en el archivo (fila ${vistos.get(numero)})`,
            );
          }
          if (numero) vistos.set(numero, vistos.get(numero) ?? fila);
          if (!codigo) errores.push('Falta el tipo');
          else if (!tipo) {
            errores.push(
              `No existe el tipo "${codigo}" (tipos del hotel: ${tipos.map((t) => t.codigo).join(', ')})`,
            );
          }
          if (piso === null || (piso !== undefined && piso < 0)) {
            errores.push('El piso debe ser un número entero');
          }
          if (descripcion.length > LARGO_DESCRIPCION) {
            errores.push(`La descripción admite hasta ${LARGO_DESCRIPCION} caracteres`);
          }

          const existente = porNumero.get(numero);
          return {
            informe: {
              fila,
              numero,
              estado: errores.length > 0 ? 'error' : existente ? 'actualizar' : 'crear',
              errores,
            } as FilaInforme,
            existente,
            tipo,
            piso: piso ?? undefined,
            descripcion: descripcion || undefined,
          };
        });

        // R53: los cambios de tipo no pueden dejar sin cupo a una reserva.
        const cambiosDeTipo = filas.filter(
          (f): f is typeof f & { existente: object; tipo: TipoHabitacion } =>
            f.informe.estado === 'actualizar' && f.existente!.tipoHabitacionId !== f.tipo!.id,
        );
        const noCaben = await reservasQueNoCaben(
          tx,
          cambiosDeTipo.map((f) => ({ habitacion: f.existente!, tipo: f.tipo })),
          hoy,
        );
        for (const f of cambiosDeTipo) {
          const error = noCaben.get(f.existente!.id);
          if (error) {
            f.informe.errores.push(error);
            f.informe.estado = 'error';
          }
        }

        const informe = armarInforme(filas.map((f) => f.informe));
        if (soloValidar) return informe;
        if (informe.resumen.error > 0) {
          throw new BadRequestException({
            message: `${informe.resumen.error} ${informe.resumen.error === 1 ? 'fila tiene' : 'filas tienen'} errores: no se importó ninguna`,
            informe,
          });
        }

        await tx.habitacion.createMany({
          data: filas
            .filter((f) => f.informe.estado === 'crear')
            .map((f) => ({
              hotelId,
              numero: f.informe.numero,
              tipoHabitacionId: f.tipo!.id,
              piso: f.piso ?? pisoDelNumero(f.informe.numero),
              descripcion: f.descripcion,
            })),
        });
        for (const f of filas.filter((f) => f.informe.estado === 'actualizar')) {
          await tx.habitacion.update({
            where: { id: f.existente!.id },
            data: { tipoHabitacionId: f.tipo!.id, piso: f.piso, descripcion: f.descripcion },
          });
        }
        const reservasCambianTipo = await reservasFuturas(
          tx,
          cambiosDeTipo.map((f) => f.existente!),
          hoy,
        );
        return { ...informe, avisos: avisos(reservasCambianTipo) };
      }),
    );
  }

  // R25/R26 en lote: las mismas reglas que el cambio uno a uno.
  async cambiarEstado(hotelId: string, ids: string[], estado: EstadoManual) {
    return this.prisma.$transaction(async (tx) => {
      const habitaciones = await this.exigirDelHotel(tx, hotelId, ids);
      exigirSinHuesped(habitaciones);
      // Excluir "ocupada" en el UPDATE protege de un check-in simultáneo: si
      // alguna cambió entre la lectura y aquí, el conteo no cuadra y nada cambia.
      const { count } = await tx.habitacion.updateMany({
        where: { id: { in: habitaciones.map((h) => h.id) }, estado: { not: 'ocupada' } },
        data: { estado },
      });
      if (count !== habitaciones.length) {
        throw new ConflictException(
          'Una de las habitaciones recibió un huésped mientras tanto: no se cambió ninguna',
        );
      }
      // B-4: marcarlas listas cierra sus tareas de limpieza "salida".
      if (estado === 'libre') {
        await cerrarTareasSalida(
          tx,
          habitaciones.map((h) => h.id),
          this.reloj.ahora(),
        );
      }
      const porReubicar =
        estado === 'fuera_servicio' ? await reservasFuturas(tx, habitaciones, this.hoy()) : [];
      return { actualizadas: count, avisos: avisos(porReubicar) };
    });
  }

  async cambiarTipo(hotelId: string, ids: string[], tipoId: string) {
    const tipo = await this.exigirTipo(hotelId, tipoId);
    return this.prisma.$transaction(async (tx) => {
      const hoy = this.hoy();
      const habitaciones = await this.exigirDelHotel(tx, hotelId, ids);
      const noCaben = await reservasQueNoCaben(
        tx,
        habitaciones.map((habitacion) => ({ habitacion, tipo })),
        hoy,
      );
      if (noCaben.size > 0) {
        throw new BadRequestException(`${[...noCaben.values()].join('. ')}: no se cambió ninguna`);
      }
      const { count } = await tx.habitacion.updateMany({
        where: { id: { in: habitaciones.map((h) => h.id) } },
        data: { tipoHabitacionId: tipo.id },
      });
      return { actualizadas: count, avisos: avisos(await reservasFuturas(tx, habitaciones, hoy)) };
    });
  }

  // Encabezados y dos filas de ejemplo con los tipos del hotel.
  async plantilla(hotelId: string) {
    const tipos = await this.prisma.tipoHabitacion.findMany({
      where: { hotelId },
      orderBy: { codigo: 'asc' },
      take: 2,
    });
    const codigo = (i: number) => tipos[i]?.codigo ?? tipos[0]?.codigo ?? 'doble';
    return aCsv(
      [
        { clave: 'numero', encabezado: 'numero' },
        { clave: 'tipo', encabezado: 'tipo' },
        { clave: 'piso', encabezado: 'piso' },
        { clave: 'descripcion', encabezado: 'descripcion' },
      ],
      [
        { numero: '101', tipo: codigo(0), piso: 1, descripcion: 'Vista al jardín' },
        { numero: '102', tipo: codigo(1), piso: 1, descripcion: '' },
      ],
    );
  }

  private async exigirTipo(hotelId: string, tipoId: string) {
    const tipo = await this.prisma.tipoHabitacion.findFirst({ where: { id: tipoId, hotelId } });
    if (!tipo) throw new NotFoundException('Tipo de habitación no encontrado');
    return tipo;
  }

  // Un id de otro hotel (o que no existe) se responde como inexistente, sin
  // decir cuál, y no cambia ninguna.
  private async exigirDelHotel(tx: Prisma.TransactionClient, hotelId: string, ids: string[]) {
    const unicos = [...new Set(ids)];
    const habitaciones = await tx.habitacion.findMany({
      where: { id: { in: unicos }, hotelId },
      orderBy: { numero: 'asc' },
    });
    if (habitaciones.length !== unicos.length) {
      throw new NotFoundException('Habitación no encontrada');
    }
    return habitaciones;
  }

  // Un número creado por otra petición entre la revisión y el INSERT viola
  // la restricción UNIQUE: es un conflicto (409), no un 500.
  private async conDuplicadosComoConflicto<T>(operacion: () => Promise<T>) {
    try {
      return await operacion();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === CODIGO_PRISMA_UNICO
      ) {
        throw new ConflictException(
          'Otra persona creó una de esas habitaciones: vuelve a intentar',
        );
      }
      throw error;
    }
  }
}

// Los avisos agrupados de un lote: reservas futuras por habitación y su total.
function avisos(reservasPorHabitacion: { numero: string; reservas: number }[]) {
  return {
    reservasFuturas: reservasPorHabitacion,
    total: reservasPorHabitacion.reduce((s, r) => s + r.reservas, 0),
  };
}
