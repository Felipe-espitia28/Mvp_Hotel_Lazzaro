import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma, Servicio } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import {
  Fila,
  FilaInforme,
  aBooleano,
  aNumero,
  aTexto,
  armarInforme,
  esFilaVacia,
  normalizarEncabezado,
  normalizarFila,
} from '../importacion/importacion';
import { aCsv } from '../reportes-legales/csv';
import { ActualizarServicioDto, CrearServicioDto } from './dto/servicios.dto';
import { camposAlActualizar, camposAlCrear, revisarServicio } from './revisar-servicio';
import { ServiciosService } from './servicios.service';
import { Definicion } from './validar-atributos';

const CODIGO_PRISMA_UNICO = 'P2002';
// Los atributos van con este prefijo para no chocar con las columnas fijas.
const PREFIJO_ATRIBUTO = 'atributo:';

// Columnas fijas del archivo (encabezado de la plantilla) y su campo en el DTO.
const COLUMNAS = [
  { columna: 'codigo', campo: 'codigo', alias: ['código', 'cod'] },
  { columna: 'nombre', campo: 'nombre', alias: ['servicio'] },
  { columna: 'descripcion', campo: 'descripcion', alias: ['descripción'] },
  { columna: 'tipo', campo: 'tipo', alias: ['tipo de servicio'] },
  { columna: 'modo_precio', campo: 'modoPrecio', alias: ['modo de precio', 'cobro'] },
  { columna: 'precio', campo: 'precio', alias: ['precio adulto', 'valor'] },
  { columna: 'precio_nino', campo: 'precioNino', alias: ['precio niño', 'precio de niño'] },
  { columna: 'duracion_minutos', campo: 'duracionMinutos', alias: ['duración', 'minutos'] },
  { columna: 'cupos_por_salida', campo: 'cuposPorSalida', alias: ['cupos'] },
  {
    columna: 'visible_recepcion',
    campo: 'visibleRecepcion',
    alias: ['visible para recepción', 'visible'],
  },
  { columna: 'activo', campo: 'activo', alias: ['activa', 'se ofrece'] },
] as const;

const COLUMNA_DE_CAMPO = new Map<string, string>(COLUMNAS.map((c) => [c.campo, c.columna]));
const NUMERICOS = new Set(['precio', 'precio_nino', 'duracion_minutos', 'cupos_por_salida']);
const BOOLEANOS = new Set(['visible_recepcion', 'activo']);

// "Por persona", "POR_PERSONA" → por_persona; un valor desconocido pasa tal
// cual para que el DTO lo rechace con su mensaje.
const TIPOS: Record<string, string> = {
  consumo: 'consumo',
  cita: 'cita',
  experiencia: 'experiencia',
};
const MODOS: Record<string, string> = {
  fijo: 'fijo',
  porpersona: 'por_persona',
  poredad: 'por_edad',
};

// El valor de un atributo según su tipo. Lo que no se puede convertir pasa
// como texto para que validar-atributos lo rechace con su mensaje.
function valorDeAtributo(celda: unknown, d: Definicion) {
  switch (d.tipo) {
    case 'si_no':
      return aBooleano(celda) ?? aTexto(celda);
    case 'numero':
      return aNumero(celda) ?? aTexto(celda);
    case 'lista': {
      const texto = aTexto(celda);
      // La opción se acepta sin importar mayúsculas ni tildes, y se guarda exacta.
      return (
        d.opciones.find((o) => normalizarEncabezado(o) === normalizarEncabezado(texto)) ?? texto
      );
    }
    case 'texto':
      return aTexto(celda);
  }
}

// Las celdas de una fila convertidas a los campos del DTO (sin las vacías:
// una celda vacía no cambia nada) y los errores de conversión.
function leerCeldas(datos: Fila, definiciones: Definicion[]) {
  const plano: Record<string, unknown> = {};
  const errores: string[] = [];
  for (const { columna, campo } of COLUMNAS) {
    if (campo === 'codigo') continue;
    const celda = datos[columna];
    if (aTexto(celda) === '') continue;
    if (NUMERICOS.has(columna)) {
      const numero = aNumero(celda);
      if (numero === null) errores.push(`Columna "${columna}": "${aTexto(celda)}" no es un número`);
      else plano[campo] = numero;
    } else if (BOOLEANOS.has(columna)) {
      const valor = aBooleano(celda);
      if (valor === null) errores.push(`Columna "${columna}": escribe si o no`);
      else plano[campo] = valor;
    } else if (columna === 'tipo') {
      plano[campo] = TIPOS[normalizarEncabezado(aTexto(celda))] ?? aTexto(celda);
    } else if (columna === 'modo_precio') {
      plano[campo] = MODOS[normalizarEncabezado(aTexto(celda))] ?? aTexto(celda);
    } else {
      plano[campo] = aTexto(celda);
    }
  }
  const atributos: Record<string, unknown> = {};
  for (const d of definiciones) {
    const celda = datos[PREFIJO_ATRIBUTO + d.clave];
    if (aTexto(celda) !== '') atributos[d.clave] = valorDeAtributo(celda, d);
  }
  return { plano, atributos, errores };
}

// Las mismas reglas del DTO que el alta manual, con la columna de cada error.
function erroresDelDto<T extends object>(clase: new () => T, plano: Record<string, unknown>) {
  const instancia = plainToInstance(clase, plano);
  const errores = validateSync(instancia, { whitelist: true, forbidNonWhitelisted: true });
  return {
    instancia,
    errores: errores.flatMap((e) =>
      Object.values(e.constraints ?? {}).map(
        (mensaje) => `Columna "${COLUMNA_DE_CAMPO.get(e.property) ?? e.property}": ${mensaje}`,
      ),
    ),
  };
}

// "filas 3 y 7" para los repetidos dentro del archivo.
const filasTexto = (filas: number[]) =>
  filas.length === 2 ? `filas ${filas[0]} y ${filas[1]}` : `filas ${filas.join(', ')}`;

// Agrupa las filas por un valor (código o nombre) para hallar los repetidos.
function repetidos(filas: { fila: number; valor: string }[]) {
  const grupos = new Map<string, number[]>();
  for (const { fila, valor } of filas) {
    if (valor) grupos.set(valor, [...(grupos.get(valor) ?? []), fila]);
  }
  return grupos;
}

// S-1 (R56): carga masiva del catálogo de una categoría desde un CSV o Excel.
// El código es la clave natural: si existe, actualiza el servicio; si no, lo
// crea. Lo que no viene en el archivo no se toca y nada se borra. Todo o nada.
@Injectable()
export class ImportarServiciosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly servicios: ServiciosService,
  ) {}

  async importar(
    hotelId: string,
    categoriaId: string,
    filasCrudas: Record<string, unknown>[],
    soloValidar: boolean,
  ) {
    const categoria = await this.servicios.categoriaDelHotel(hotelId, categoriaId);
    const alias = Object.fromEntries([
      ...COLUMNAS.map((c) => [c.columna, [...c.alias]]),
      // El encabezado de un atributo es su etiqueta; también se acepta su clave.
      ...categoria.atributos.map((d) => [PREFIJO_ATRIBUTO + d.clave, [d.clave, d.etiqueta]]),
    ]);
    // La fila 1 del archivo son los encabezados.
    const leidas = filasCrudas
      .map((f, i) => ({ fila: i + 2, datos: normalizarFila(f, alias) }))
      .filter((f) => !esFilaVacia(f.datos));
    if (leidas.length === 0) {
      throw new BadRequestException('El archivo no tiene filas con datos');
    }
    const codigoDe = (datos: Fila) => aTexto(datos.codigo).toLowerCase();
    const nombreDe = (datos: Fila) => aTexto(datos.nombre);

    return this.conDuplicadosComoConflicto(() =>
      this.prisma.$transaction(async (tx) => {
        const existentes = await tx.servicio.findMany({
          where: {
            hotelId,
            OR: [
              { codigo: { in: leidas.map((l) => codigoDe(l.datos)) } },
              { nombre: { in: leidas.map((l) => nombreDe(l.datos)).filter(Boolean) } },
            ],
          },
          omit: { fotos: true },
          include: { categoria: { select: { nombre: true } } },
        });
        const porCodigo = new Map(existentes.map((s) => [s.codigo, s]));
        const porNombre = new Map(existentes.map((s) => [s.nombre, s]));
        const codigosRepetidos = repetidos(
          leidas.map((l) => ({ fila: l.fila, valor: codigoDe(l.datos) })),
        );
        const nombresRepetidos = repetidos(
          leidas.map((l) => ({ fila: l.fila, valor: nombreDe(l.datos) })),
        );

        const filas = leidas.map(({ fila, datos }) => {
          const codigo = codigoDe(datos);
          const errores: string[] = [];
          const existente = porCodigo.get(codigo) as Servicio | undefined;

          if (!codigo) errores.push('Falta el código');
          const conMismoCodigo = codigosRepetidos.get(codigo) ?? [];
          if (conMismoCodigo.length > 1) {
            errores.push(
              `El código ${codigo} está repetido en el archivo (${filasTexto(conMismoCodigo)})`,
            );
          }
          if (existente && existente.categoriaId !== categoria.id) {
            const otra = existentes.find((s) => s.id === existente.id)!.categoria.nombre;
            errores.push(`El código ${codigo} ya está en la categoría "${otra}"`);
          }

          const celdas = leerCeldas(datos, categoria.atributos);
          errores.push(...celdas.errores);
          const nombre = (celdas.plano.nombre as string | undefined) ?? existente?.nombre;
          const conMismoNombre = nombresRepetidos.get(nombreDe(datos)) ?? [];
          if (conMismoNombre.length > 1) {
            errores.push(
              `El nombre "${nombreDe(datos)}" está repetido en el archivo (${filasTexto(conMismoNombre)})`,
            );
          }
          const otroConNombre = nombre ? porNombre.get(nombre) : undefined;
          if (otroConNombre && otroConNombre.codigo !== codigo) {
            errores.push(
              `Ya existe otro servicio llamado "${nombre}" (código ${otroConNombre.codigo})`,
            );
          }

          // Las mismas reglas que el alta manual: el DTO y después las del
          // tipo y los atributos de la categoría (revisar-servicio.ts).
          let datosAGuardar: Record<string, unknown> | null = null;
          if (codigo && errores.length === 0) {
            const plano = existente
              ? celdas.plano
              : { ...celdas.plano, codigo, categoriaId: categoria.id };
            const dto = existente
              ? erroresDelDto(ActualizarServicioDto, plano)
              : erroresDelDto(CrearServicioDto, plano);
            errores.push(...dto.errores);
            if (dto.errores.length === 0) {
              const campos = existente
                ? camposAlActualizar(existente, dto.instancia)
                : camposAlCrear(dto.instancia as CrearServicioDto);
              // Los atributos que no vienen en el archivo se conservan.
              const atributos = {
                ...((existente?.atributos as Record<string, unknown> | undefined) ?? {}),
                ...celdas.atributos,
              };
              const revision = revisarServicio(categoria.atributos, atributos, campos);
              errores.push(...revision.errores);
              datosAGuardar = { ...celdas.plano, ...revision.datos };
            }
          }

          return {
            informe: {
              fila,
              numero: codigo,
              estado: errores.length > 0 ? 'error' : existente ? 'actualizar' : 'crear',
              errores,
            } as FilaInforme,
            existente,
            datosAGuardar,
          };
        });

        const informe = armarInforme(filas.map((f) => f.informe));
        if (soloValidar) return informe;
        if (informe.resumen.error > 0) {
          throw new BadRequestException({
            message: `${informe.resumen.error} ${informe.resumen.error === 1 ? 'fila tiene' : 'filas tienen'} errores: no se importó ninguna`,
            informe,
          });
        }

        for (const f of filas) {
          if (f.existente) {
            await tx.servicio.update({
              where: { id: f.existente.id },
              data: f.datosAGuardar as Prisma.ServicioUncheckedUpdateInput,
            });
          } else {
            await tx.servicio.create({
              data: {
                ...(f.datosAGuardar as Omit<Prisma.ServicioUncheckedCreateInput, 'hotelId'>),
                codigo: f.informe.numero,
                categoriaId: categoria.id,
                hotelId,
              },
            });
          }
        }
        return informe;
      }),
    );
  }

  // Los encabezados de la categoría (fijos + uno por atributo propio, con su
  // etiqueta) y una fila de ejemplo con valores válidos.
  async plantilla(hotelId: string, categoriaId: string) {
    const categoria = await this.servicios.categoriaDelHotel(hotelId, categoriaId);
    const atributos = [...categoria.atributos].sort((a, b) => a.orden - b.orden);
    const ejemplo: Record<string, unknown> =
      categoria.clasificacion === 'spa'
        ? {
            codigo: 'masaje-60',
            nombre: 'Masaje relajante 60 min',
            tipo: 'cita',
            modo_precio: 'por_persona',
            precio: 120000,
            duracion_minutos: 60,
          }
        : categoria.clasificacion === 'experiencia'
          ? {
              codigo: 'tour-manglares',
              nombre: 'Tour por los manglares',
              tipo: 'experiencia',
              modo_precio: 'por_edad',
              precio: 90000,
              precio_nino: 45000,
              duracion_minutos: 180,
              cupos_por_salida: 12,
            }
          : { codigo: 'ejemplo-1', nombre: 'Servicio de ejemplo', tipo: 'consumo', precio: 10000 };
    ejemplo.modo_precio ??= 'fijo';
    ejemplo.descripcion = 'Descripción opcional';
    ejemplo.visible_recepcion = 'si';
    ejemplo.activo = 'si';
    for (const d of atributos) {
      ejemplo[PREFIJO_ATRIBUTO + d.clave] =
        d.tipo === 'lista'
          ? d.opciones[0]
          : d.tipo === 'si_no'
            ? 'si'
            : d.tipo === 'numero'
              ? 1
              : 'Ejemplo';
    }
    return aCsv(
      [
        ...COLUMNAS.map((c) => ({ clave: c.columna, encabezado: c.columna })),
        ...atributos.map((d) => ({ clave: PREFIJO_ATRIBUTO + d.clave, encabezado: d.etiqueta })),
      ],
      [ejemplo],
    );
  }

  // Un código o un nombre creado por otra petición entre la revisión y el
  // INSERT viola la restricción UNIQUE: es un conflicto (409), no un 500.
  private async conDuplicadosComoConflicto<T>(operacion: () => Promise<T>) {
    try {
      return await operacion();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === CODIGO_PRISMA_UNICO
      ) {
        throw new ConflictException(
          'Otra persona cambió el catálogo mientras tanto: vuelve a intentar',
        );
      }
      throw error;
    }
  }
}
