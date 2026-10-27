import type {
  Huesped,
  MotivoViaje,
  Parentesco,
  ProblemaRegistro,
  RegistroCheckIn,
  TipoDocumento,
} from '../api/types';

// Formulario de check-in con todos los ocupantes (R43–R45). Esta lógica solo
// ayuda a recepción a ver qué falta antes de enviar: la validación real la
// hace el backend.

// Estado de la tarjeta de un ocupante. Las fechas van como YYYY-MM-DD ('' = sin dato).
export interface FormularioOcupante {
  tipoDocumento: TipoDocumento;
  documento: string;
  primerNombre: string;
  segundoNombre: string;
  primerApellido: string;
  segundoApellido: string;
  fechaNacimiento: string;
  nacionalidad: string;
  paisResidencia: string;
  ciudadResidencia: string;
  paisProcedencia: string;
  ciudadProcedencia: string;
  // R44: solo para menores.
  responsableIndice: number | null;
  parentesco: Parentesco | '';
  autorizacionVerificada: boolean;
  // R45: solo para adultos.
  aceptaPoliticaDatos: boolean;
  // R36: los nombres de un huésped conocido no se cambian desde aquí.
  nombresBloqueados: boolean;
}

export const MAYORIA_DE_EDAD = 18;

// R44: con un familiar o un tercero, recepción verifica el permiso de los padres.
export const PARENTESCOS_CON_PERMISO: Parentesco[] = ['familiar', 'tercero_autorizado'];

// R43: datos que exige la ley a cada ocupante (los mismos que revisa el backend).
export const CAMPOS_OBLIGATORIOS = [
  'documento',
  'primerNombre',
  'primerApellido',
  'fechaNacimiento',
  'nacionalidad',
  'paisResidencia',
  'ciudadResidencia',
  'paisProcedencia',
  'ciudadProcedencia',
] as const satisfies readonly (keyof FormularioOcupante)[];

export function ocupanteVacio(cambios: Partial<FormularioOcupante> = {}): FormularioOcupante {
  return {
    tipoDocumento: 'CC',
    documento: '',
    primerNombre: '',
    segundoNombre: '',
    primerApellido: '',
    segundoApellido: '',
    fechaNacimiento: '',
    nacionalidad: 'CO',
    paisResidencia: 'CO',
    ciudadResidencia: '',
    paisProcedencia: 'CO',
    ciudadProcedencia: '',
    responsableIndice: null,
    parentesco: '',
    autorizacionVerificada: false,
    aceptaPoliticaDatos: false,
    nombresBloqueados: false,
    ...cambios,
  };
}

// Un huésped ya registrado: se precargan sus datos. Sus nombres quedan de solo
// lectura (R36), salvo que estén "por completar" (sin apellido): esos se
// separan en el check-in (R46).
export function ocupanteDesdeHuesped(
  h: Huesped,
  base: FormularioOcupante = ocupanteVacio(),
): FormularioOcupante {
  const porCompletar = h.primerApellido === '' && !h.datosCompletos;
  return {
    ...base,
    tipoDocumento: h.tipoDocumento,
    documento: h.documento,
    primerNombre: porCompletar ? '' : h.primerNombre,
    segundoNombre: porCompletar ? '' : (h.segundoNombre ?? ''),
    primerApellido: h.primerApellido,
    segundoApellido: h.segundoApellido ?? '',
    fechaNacimiento: h.fechaNacimiento?.slice(0, 10) ?? base.fechaNacimiento,
    nacionalidad: h.nacionalidad ?? base.nacionalidad,
    paisResidencia: h.paisResidencia ?? base.paisResidencia,
    ciudadResidencia: h.ciudadResidencia ?? base.ciudadResidencia,
    nombresBloqueados: !porCompletar,
  };
}

// Edad cumplida en una fecha (YYYY-MM-DD, o ISO completo). Quien nació un 29
// de febrero cumple el 1 de marzo en los años no bisiestos.
export function edadEn(fechaNacimiento: string, fecha: string) {
  const [an, mn, dn] = fechaNacimiento.slice(0, 10).split('-').map(Number);
  const [a, m, d] = fecha.slice(0, 10).split('-').map(Number);
  const aunNoCumple = m < mn || (m === mn && d < dn);
  return a - an - (aunNoCumple ? 1 : 0);
}

// R44: menor de edad el día de la entrada. Sin fecha de nacimiento no se sabe.
export function esMenor(o: Pick<FormularioOcupante, 'fechaNacimiento'>, fechaEntrada: string) {
  if (!o.fechaNacimiento) return false;
  const edad = edadEn(o.fechaNacimiento, fechaEntrada);
  return edad >= 0 && edad < MAYORIA_DE_EDAD;
}

// R43: campos vacíos de un ocupante.
export function faltantes(o: FormularioOcupante) {
  return CAMPOS_OBLIGATORIOS.filter((campo) => o[campo].trim() === '');
}

// Lo común en familias: los acompañantes viven y vienen de donde el titular.
export function igualQueTitular(
  acompanante: FormularioOcupante,
  titular: FormularioOcupante,
): FormularioOcupante {
  return {
    ...acompanante,
    paisResidencia: titular.paisResidencia,
    ciudadResidencia: titular.ciudadResidencia,
    paisProcedencia: titular.paisProcedencia,
    ciudadProcedencia: titular.ciudadProcedencia,
  };
}

const textoOpcional = (valor: string) => valor.trim() || undefined;

// Cuerpo de POST /reservas/:id/check-in. El primero es el titular. A un adulto
// no se le envían datos de menor, ni a un menor la aceptación (la da su responsable).
export function aCuerpoCheckIn(
  motivoViaje: MotivoViaje,
  tarjetas: FormularioOcupante[],
  fechaEntrada: string,
): RegistroCheckIn {
  return {
    motivoViaje,
    ocupantes: tarjetas.map((o, i) => {
      const menor = esMenor(o, fechaEntrada);
      return {
        titular: i === 0,
        tipoDocumento: o.tipoDocumento,
        documento: o.documento.trim(),
        primerNombre: textoOpcional(o.primerNombre),
        segundoNombre: textoOpcional(o.segundoNombre),
        primerApellido: textoOpcional(o.primerApellido),
        segundoApellido: textoOpcional(o.segundoApellido),
        fechaNacimiento: textoOpcional(o.fechaNacimiento),
        nacionalidad: textoOpcional(o.nacionalidad),
        paisResidencia: textoOpcional(o.paisResidencia),
        ciudadResidencia: textoOpcional(o.ciudadResidencia),
        paisProcedencia: textoOpcional(o.paisProcedencia),
        ciudadProcedencia: textoOpcional(o.ciudadProcedencia),
        ...(menor
          ? {
              responsableIndice: o.responsableIndice ?? undefined,
              parentesco: o.parentesco || undefined,
              autorizacionVerificada: o.autorizacionVerificada,
            }
          : { aceptaPoliticaDatos: o.aceptaPoliticaDatos }),
      };
    }),
  };
}

// Problemas del backend agrupados para marcarlos donde van: por ocupante y
// campo, y los de la reserva entera (o de un campo que no tiene la tarjeta) aparte.
export function agruparProblemas(problemas: ProblemaRegistro[]) {
  const porOcupante: Record<number, Record<string, string>> = {};
  const generales: string[] = [];
  for (const p of problemas) {
    if (p.ocupante === null || p.campo === null) {
      generales.push(p.mensaje);
      continue;
    }
    porOcupante[p.ocupante] ??= {};
    porOcupante[p.ocupante][p.campo] = p.mensaje;
  }
  return { porOcupante, generales };
}
