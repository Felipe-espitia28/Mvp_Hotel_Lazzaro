// Pruebas unitarias del registro legal de huéspedes: sin base de datos ni NestJS.
import { MAYORIA_DE_EDAD, edadEn } from './edad';
import { OcupanteARevisar, Persona, combinarPersona, revisarOcupantes } from './datos-legales';

const d = (iso: string) => new Date(iso);

describe('edadEn', () => {
  it('cumple años el mismo día, no antes', () => {
    expect(edadEn(d('2012-05-10'), d('2030-05-10'))).toBe(MAYORIA_DE_EDAD);
    expect(edadEn(d('2012-05-10'), d('2030-05-09'))).toBe(17);
    expect(edadEn(d('2012-05-10'), d('2030-04-30'))).toBe(17);
  });

  it('quien nació un 29 de febrero cumple el 1 de marzo en años no bisiestos', () => {
    expect(edadEn(d('2012-02-29'), d('2030-02-28'))).toBe(17);
    expect(edadEn(d('2012-02-29'), d('2030-03-01'))).toBe(18);
    expect(edadEn(d('2012-02-29'), d('2032-02-29'))).toBe(20);
  });
});

const persona = (cambios: Partial<Persona> = {}): Persona => ({
  tipoDocumento: 'CC',
  documento: '111',
  primerNombre: 'Ana',
  segundoNombre: null,
  primerApellido: 'Pérez',
  segundoApellido: null,
  fechaNacimiento: d('1990-01-01'),
  nacionalidad: 'CO',
  paisResidencia: 'CO',
  ciudadResidencia: 'Cali',
  email: null,
  telefono: null,
  ...cambios,
});

const ocupante = (cambios: Partial<OcupanteARevisar> = {}): OcupanteARevisar => ({
  persona: persona(),
  paisProcedencia: 'CO',
  ciudadProcedencia: 'Cali',
  aceptoPoliticaDatos: true,
  ...cambios,
});

describe('combinarPersona (R36, R46)', () => {
  it('conserva el nombre registrado y completa solo lo que falta', () => {
    const existente = {
      ...persona({ fechaNacimiento: null, ciudadResidencia: 'Cali' }),
      datosCompletos: false,
    };
    const r = combinarPersona(existente, {
      documento: '111',
      primerNombre: 'Otra',
      primerApellido: 'Persona',
      fechaNacimiento: d('1991-02-02'),
      ciudadResidencia: 'Bogotá',
      telefono: '300',
    });
    expect([r.nombre, r.fechaNacimiento, r.ciudadResidencia, r.telefono]).toEqual([
      'Ana Pérez',
      d('1991-02-02'),
      'Cali',
      '300',
    ]);
    expect(r.datosCompletos).toBe(true);
  });

  it('un nombre "por completar" se reemplaza por los nombres separados', () => {
    const existente = {
      ...persona({ primerNombre: 'Ana María Pérez', primerApellido: '' }),
      datosCompletos: false,
    };
    const r = combinarPersona(existente, {
      documento: '111',
      primerNombre: 'Ana',
      segundoNombre: 'María',
      primerApellido: 'Pérez',
    });
    expect([r.primerNombre, r.segundoNombre, r.primerApellido, r.nombre]).toEqual([
      'Ana',
      'María',
      'Pérez',
      'Ana María Pérez',
    ]);
    // Sin apellido no se pisa: así la reserva con solo el nombre no lo cambia.
    expect(combinarPersona(existente, { documento: '111', primerNombre: 'Otra' }).nombre).toBe(
      'Ana María Pérez',
    );
  });
});

describe('revisarOcupantes (R43–R45)', () => {
  const entrada = d('2030-01-01');

  it('un ocupante completo y adulto no tiene problemas', () => {
    expect(revisarOcupantes([ocupante()], entrada)).toEqual([]);
  });

  it('lista los faltantes por ocupante', () => {
    const errores = revisarOcupantes(
      [
        ocupante(),
        ocupante({ persona: persona({ fechaNacimiento: null }), ciudadProcedencia: '' }),
      ],
      entrada,
    );
    expect(errores).toEqual([
      'Ocupante 2 (Ana Pérez): falta fecha de nacimiento, ciudad de procedencia',
    ]);
  });

  it('un menor colombiano lleva el documento de su edad, un responsable y su parentesco', () => {
    const menor = (cambios: Partial<OcupanteARevisar>) =>
      ocupante({
        persona: persona({
          primerNombre: 'Leo',
          tipoDocumento: 'TI',
          fechaNacimiento: d('2026-06-01'),
        }),
        responsableIndice: 0,
        parentesco: 'padre_madre',
        aceptoPoliticaDatos: false, // la acepta su responsable
        ...cambios,
      });

    expect(revisarOcupantes([ocupante(), menor({})], entrada)).toEqual([
      'Ocupante 2 (Leo Pérez): un menor colombiano de 3 años se registra con registro civil',
    ]);
    const conRegistroCivil = { persona: { ...menor({}).persona, tipoDocumento: 'RC' as const } };
    expect(revisarOcupantes([ocupante(), menor(conRegistroCivil)], entrada)).toEqual([]);
    expect(
      revisarOcupantes(
        [
          ocupante(),
          menor({ ...conRegistroCivil, responsableIndice: undefined, parentesco: undefined }),
        ],
        entrada,
      ),
    ).toHaveLength(2);
    expect(
      revisarOcupantes(
        [ocupante(), menor({ ...conRegistroCivil, parentesco: 'tercero_autorizado' })],
        entrada,
      ),
    ).toEqual(['Ocupante 2 (Leo Pérez): falta verificar el permiso de los padres']);
  });

  it('no admite una reserva de solo menores', () => {
    const solo = ocupante({
      persona: persona({ tipoDocumento: 'TI', fechaNacimiento: d('2015-01-01') }),
      parentesco: 'padre_madre',
    });
    expect(revisarOcupantes([solo], entrada)[0]).toBe(
      'Una reserva no puede tener solo menores de edad',
    );
  });

  it('el adulto debe aceptar la política de datos', () => {
    expect(revisarOcupantes([ocupante({ aceptoPoliticaDatos: false })], entrada)).toEqual([
      'Ocupante 1 (Ana Pérez): debe aceptar la política de tratamiento de datos',
    ]);
  });
});
