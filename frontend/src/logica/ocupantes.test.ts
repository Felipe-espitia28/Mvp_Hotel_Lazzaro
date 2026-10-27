import { describe, expect, it } from 'vitest';
import type { Huesped } from '../api/types';
import {
  aCuerpoCheckIn,
  agruparProblemas,
  edadEn,
  esMenor,
  faltantes,
  igualQueTitular,
  ocupanteDesdeHuesped,
  ocupanteVacio,
} from './ocupantes';

const completo = ocupanteVacio({
  documento: '111',
  primerNombre: 'Ana',
  primerApellido: 'Pérez',
  fechaNacimiento: '1990-01-01',
  ciudadResidencia: 'Cali',
  ciudadProcedencia: 'Cali',
});

describe('edad y menores (R44)', () => {
  it('quien cumple 18 el día de la entrada ya es adulto', () => {
    expect(esMenor({ fechaNacimiento: '2012-03-10' }, '2030-03-10')).toBe(false);
    expect(esMenor({ fechaNacimiento: '2012-03-11' }, '2030-03-10')).toBe(true);
  });

  it('quien nació un 29 de febrero cumple el 1 de marzo en años no bisiestos', () => {
    expect(edadEn('2012-02-29', '2030-02-28')).toBe(17);
    expect(edadEn('2012-02-29', '2030-03-01T00:00:00.000Z')).toBe(18);
  });

  it('sin fecha de nacimiento no se marca como menor', () => {
    expect(esMenor({ fechaNacimiento: '' }, '2030-03-10')).toBe(false);
  });
});

describe('faltantes por ocupante (R43)', () => {
  it('un ocupante completo no tiene faltantes', () => {
    expect(faltantes(completo)).toEqual([]);
  });

  it('lista los campos vacíos, aunque solo tengan espacios', () => {
    expect(faltantes({ ...completo, fechaNacimiento: '', ciudadProcedencia: '  ' })).toEqual([
      'fechaNacimiento',
      'ciudadProcedencia',
    ]);
  });
});

describe('igual que el titular', () => {
  it('copia la residencia y la procedencia, y nada más', () => {
    const titular = {
      ...completo,
      paisResidencia: 'US',
      ciudadResidencia: 'Miami',
      paisProcedencia: 'PA',
      ciudadProcedencia: 'Panamá',
    };
    const hijo = ocupanteVacio({ documento: '222', primerNombre: 'Leo' });

    expect(igualQueTitular(hijo, titular)).toEqual({
      ...hijo,
      paisResidencia: 'US',
      ciudadResidencia: 'Miami',
      paisProcedencia: 'PA',
      ciudadProcedencia: 'Panamá',
    });
  });
});

describe('huésped conocido (R36, R46)', () => {
  const huesped: Huesped = {
    id: 'h1',
    nombre: 'Ana Pérez',
    primerNombre: 'Ana',
    segundoNombre: null,
    primerApellido: 'Pérez',
    segundoApellido: null,
    tipoDocumento: 'CC',
    documento: '111',
    telefono: null,
    email: null,
    fechaNacimiento: '1990-01-01T00:00:00.000Z',
    nacionalidad: 'CO',
    paisResidencia: 'CO',
    ciudadResidencia: 'Cali',
    datosCompletos: true,
  };

  it('precarga sus datos y deja sus nombres de solo lectura', () => {
    const o = ocupanteDesdeHuesped(huesped);
    expect([o.primerNombre, o.fechaNacimiento, o.ciudadResidencia, o.nombresBloqueados]).toEqual([
      'Ana',
      '1990-01-01',
      'Cali',
      true,
    ]);
  });

  it('un nombre "por completar" se deja para escribirlo separado', () => {
    const o = ocupanteDesdeHuesped({
      ...huesped,
      primerNombre: 'Ana María Pérez',
      primerApellido: '',
      datosCompletos: false,
    });
    expect([o.primerNombre, o.primerApellido, o.nombresBloqueados]).toEqual(['', '', false]);
  });
});

describe('cuerpo del check-in', () => {
  it('el primero es el titular; el menor lleva su responsable y el adulto su aceptación', () => {
    const menor = ocupanteVacio({
      ...completo,
      documento: '222',
      tipoDocumento: 'TI',
      fechaNacimiento: '2018-01-01',
      responsableIndice: 0,
      parentesco: 'padre_madre',
      aceptaPoliticaDatos: true, // no se envía: la da su responsable
    });
    const cuerpo = aCuerpoCheckIn(
      'turismo',
      [{ ...completo, aceptaPoliticaDatos: true }, menor],
      '2030-01-01',
    );

    expect(cuerpo.ocupantes[0]).toMatchObject({ titular: true, aceptaPoliticaDatos: true });
    expect(cuerpo.ocupantes[0]).not.toHaveProperty('parentesco');
    expect(cuerpo.ocupantes[1]).toMatchObject({
      titular: false,
      responsableIndice: 0,
      parentesco: 'padre_madre',
    });
    expect(cuerpo.ocupantes[1]).not.toHaveProperty('aceptaPoliticaDatos');
    expect(cuerpo.ocupantes[1].segundoNombre).toBeUndefined();
  });
});

describe('problemas del backend', () => {
  it('se agrupan por ocupante y campo; los de la reserva van aparte', () => {
    expect(
      agruparProblemas([
        { ocupante: null, campo: null, mensaje: 'Una reserva no puede tener solo menores de edad' },
        { ocupante: 1, campo: 'fechaNacimiento', mensaje: 'Falta fecha de nacimiento' },
        { ocupante: 1, campo: 'ciudadProcedencia', mensaje: 'Falta ciudad de procedencia' },
      ]),
    ).toEqual({
      generales: ['Una reserva no puede tener solo menores de edad'],
      porOcupante: {
        1: {
          fechaNacimiento: 'Falta fecha de nacimiento',
          ciudadProcedencia: 'Falta ciudad de procedencia',
        },
      },
    });
  });
});
