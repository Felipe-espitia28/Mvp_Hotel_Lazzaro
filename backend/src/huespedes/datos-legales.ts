// Reglas del registro legal de huéspedes (R43–R46): qué datos exige la ley,
// cómo se combinan con los de un huésped que vuelve y qué se valida de los
// menores. Sin NestJS ni Prisma: se prueba sin base de datos.
import { MAYORIA_DE_EDAD, edadEn } from './edad';

export type TipoDocumento = 'CC' | 'CE' | 'PASAPORTE' | 'TI' | 'PPT' | 'RC' | 'PEP';
export type Parentesco = 'padre_madre' | 'familiar' | 'tutor_legal' | 'tercero_autorizado';

// Lo que es de la persona (se guarda en Huesped y sirve para la próxima visita).
export interface Persona {
  tipoDocumento: TipoDocumento;
  documento: string;
  primerNombre: string;
  segundoNombre: string | null;
  primerApellido: string;
  segundoApellido: string | null;
  fechaNacimiento: Date | null;
  nacionalidad: string | null;
  paisResidencia: string | null;
  ciudadResidencia: string | null;
  email: string | null;
  telefono: string | null;
}

// Lo que llega de un formulario: todo opcional salvo el documento.
export type DatosPersona = Partial<Omit<Persona, 'tipoDocumento' | 'documento'>> &
  Pick<Persona, 'documento'> & { tipoDocumento?: TipoDocumento };

// R43: datos de la persona que exigen la TRA y el SIRE, con su nombre legible.
const CAMPOS_PERSONA: [keyof Persona, string][] = [
  ['tipoDocumento', 'tipo de documento'],
  ['documento', 'número de documento'],
  ['primerNombre', 'primer nombre'],
  ['primerApellido', 'primer apellido'],
  ['fechaNacimiento', 'fecha de nacimiento'],
  ['nacionalidad', 'nacionalidad'],
  ['paisResidencia', 'país de residencia'],
  ['ciudadResidencia', 'ciudad de residencia'],
];

const vacio = (valor: unknown) =>
  valor === null || valor === undefined || (typeof valor === 'string' && valor.trim() === '');

export function nombreCompleto(
  p: Pick<Persona, 'primerNombre' | 'segundoNombre' | 'primerApellido' | 'segundoApellido'>,
) {
  return [p.primerNombre, p.segundoNombre, p.primerApellido, p.segundoApellido]
    .filter((parte) => !vacio(parte))
    .map((parte) => parte!.trim())
    .join(' ');
}

export function faltantesDePersona(p: Persona) {
  return CAMPOS_PERSONA.filter(([campo]) => vacio(p[campo])).map(([, nombre]) => nombre);
}

// R36 + R46: cómo queda la persona al registrarla de nuevo.
// - Los nombres se conservan (un error al digitar el documento no le cambia el
//   nombre a otro cliente), salvo que estén "por completar": sin apellido y con
//   datos incompletos (huéspedes anteriores a los nombres separados, o
//   reservados solo con el nombre). Entonces se toman los nombres separados.
// - Fecha de nacimiento, residencia y correo solo se completan si faltan.
// - Teléfono y nacionalidad se actualizan con lo último que se registró.
export function combinarPersona(
  existente: (Persona & { datosCompletos: boolean }) | null,
  datos: DatosPersona,
): Persona & { nombre: string; datosCompletos: boolean } {
  const tipoDocumento = existente?.tipoDocumento ?? datos.tipoDocumento ?? 'CC';
  const enviados = {
    primerNombre: datos.primerNombre?.trim() ?? '',
    segundoNombre: datos.segundoNombre?.trim() || null,
    primerApellido: datos.primerApellido?.trim() ?? '',
    segundoApellido: datos.segundoApellido?.trim() || null,
  };
  const nombresPorCompletar =
    existente !== null && !existente.datosCompletos && existente.primerApellido === '';
  const nombres =
    existente === null || (nombresPorCompletar && enviados.primerApellido !== '')
      ? enviados
      : {
          primerNombre: existente.primerNombre,
          segundoNombre: existente.segundoNombre,
          primerApellido: existente.primerApellido,
          segundoApellido: existente.segundoApellido,
        };

  const persona: Persona = {
    tipoDocumento,
    documento: existente?.documento ?? datos.documento,
    ...nombres,
    fechaNacimiento: existente?.fechaNacimiento ?? datos.fechaNacimiento ?? null,
    paisResidencia: existente?.paisResidencia ?? datos.paisResidencia ?? null,
    ciudadResidencia: existente?.ciudadResidencia ?? (datos.ciudadResidencia?.trim() || null),
    email: existente?.email ?? (datos.email?.trim() || null),
    nacionalidad: datos.nacionalidad ?? existente?.nacionalidad ?? null,
    telefono: datos.telefono ?? existente?.telefono ?? null,
  };
  return {
    ...persona,
    nombre: nombreCompleto(persona),
    datosCompletos: faltantesDePersona(persona).length === 0,
  };
}

// Un ocupante tal como queda para el check-in: la persona ya combinada con lo
// que el hotel tenía registrado, más los datos de esta estadía.
export interface OcupanteARevisar {
  persona: Persona;
  paisProcedencia?: string;
  ciudadProcedencia?: string;
  responsableIndice?: number;
  parentesco?: Parentesco;
  autorizacionVerificada?: boolean;
  // Aceptó la versión vigente de la política de datos, ahora o en otra visita.
  aceptoPoliticaDatos: boolean;
}

// R44: con un familiar o un tercero, el hotel verifica el permiso de los padres.
export const PARENTESCOS_CON_PERMISO: Parentesco[] = ['familiar', 'tercero_autorizado'];

const etiqueta = (o: OcupanteARevisar, indice: number) => {
  const nombre = nombreCompleto(o.persona);
  return `Ocupante ${indice + 1}${nombre ? ` (${nombre})` : ''}`;
};

// R43–R45: problemas del registro legal, uno por línea y con el ocupante que
// lo tiene. Lista vacía = se puede hacer el check-in.
export function revisarOcupantes(ocupantes: OcupanteARevisar[], fechaEntrada: Date) {
  const errores: string[] = [];
  const edades = ocupantes.map((o) =>
    o.persona.fechaNacimiento ? edadEn(o.persona.fechaNacimiento, fechaEntrada) : null,
  );
  // Sin fecha de nacimiento ya se reporta como faltante; se trata como adulto
  // para no sumar errores que confundan.
  const esMenor = (i: number) => edades[i] !== null && edades[i]! < MAYORIA_DE_EDAD;

  ocupantes.forEach((o, i) => {
    const quien = etiqueta(o, i);
    const faltantes = faltantesDePersona(o.persona);
    if (vacio(o.paisProcedencia)) faltantes.push('país de procedencia');
    if (vacio(o.ciudadProcedencia)) faltantes.push('ciudad de procedencia');
    if (faltantes.length > 0) {
      errores.push(`${quien}: falta ${faltantes.join(', ')}`);
    }

    const edad = edades[i];
    if (edad !== null && edad < 0) {
      errores.push(`${quien}: la fecha de nacimiento es posterior a la entrada`);
      return;
    }

    if (!esMenor(i)) {
      if (!o.aceptoPoliticaDatos) {
        errores.push(`${quien}: debe aceptar la política de tratamiento de datos`);
      }
      return;
    }

    // R44: el documento de un menor colombiano depende de su edad.
    if (o.persona.nacionalidad === 'CO') {
      const esperado = edad! < 7 ? 'RC' : 'TI';
      if (o.persona.tipoDocumento !== esperado) {
        errores.push(
          `${quien}: un menor colombiano de ${edad} años se registra con ${esperado === 'RC' ? 'registro civil' : 'tarjeta de identidad'}`,
        );
      }
    }
    const r = o.responsableIndice;
    if (r === undefined || r === i || r < 0 || r >= ocupantes.length || esMenor(r)) {
      errores.push(`${quien}: es menor de edad y necesita un adulto responsable en la reserva`);
    }
    if (!o.parentesco) {
      errores.push(`${quien}: falta el parentesco con el adulto responsable`);
    } else if (PARENTESCOS_CON_PERMISO.includes(o.parentesco) && !o.autorizacionVerificada) {
      errores.push(`${quien}: falta verificar el permiso de los padres`);
    }
  });

  if (ocupantes.length > 0 && ocupantes.every((_, i) => esMenor(i))) {
    errores.unshift('Una reserva no puede tener solo menores de edad');
  }
  return errores;
}
