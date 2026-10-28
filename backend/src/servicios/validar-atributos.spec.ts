import { Definicion, sinVacios, validarAtributos } from './validar-atributos';

const DEFINICIONES: Definicion[] = [
  {
    clave: 'nivel',
    etiqueta: 'Nivel de dificultad',
    tipo: 'lista',
    opciones: ['baja', 'media', 'alta'],
    obligatorio: true,
  },
  {
    clave: 'cita_previa',
    etiqueta: 'Requiere cita previa',
    tipo: 'si_no',
    opciones: [],
    obligatorio: false,
  },
  {
    clave: 'edad_minima',
    etiqueta: 'Edad mínima',
    tipo: 'numero',
    opciones: [],
    obligatorio: false,
  },
  { clave: 'incluye', etiqueta: 'Incluye', tipo: 'texto', opciones: [], obligatorio: false },
];

describe('validarAtributos', () => {
  it('acepta valores válidos y los opcionales que faltan', () => {
    expect(validarAtributos({ nivel: 'media', cita_previa: true }, DEFINICIONES)).toEqual([]);
    expect(
      validarAtributos({ nivel: 'alta', edad_minima: 12, incluye: 'Almuerzo' }, DEFINICIONES),
    ).toEqual([]);
  });

  it('un obligatorio que falta o viene en blanco', () => {
    expect(validarAtributos({}, DEFINICIONES)).toEqual(['Falta "Nivel de dificultad"']);
    expect(validarAtributos({ nivel: '  ' }, DEFINICIONES)).toEqual([
      'Falta "Nivel de dificultad"',
    ]);
  });

  it('un tipo incorrecto', () => {
    expect(validarAtributos({ nivel: 'baja', edad_minima: '12' }, DEFINICIONES)).toEqual([
      '"Edad mínima" debe ser un número',
    ]);
    expect(validarAtributos({ nivel: 'baja', cita_previa: 'sí' }, DEFINICIONES)).toEqual([
      '"Requiere cita previa" debe ser sí o no',
    ]);
    expect(validarAtributos({ nivel: 'baja', incluye: 'x'.repeat(201) }, DEFINICIONES)).toEqual([
      '"Incluye" admite hasta 200 caracteres',
    ]);
  });

  it('una opción que no está en la lista', () => {
    expect(validarAtributos({ nivel: 'extrema' }, DEFINICIONES)).toEqual([
      '"Nivel de dificultad" debe ser una de: baja, media, alta',
    ]);
  });

  it('una clave desconocida', () => {
    expect(validarAtributos({ nivel: 'baja', color: 'azul' }, DEFINICIONES)).toEqual([
      'La categoría no tiene el atributo "color"',
    ]);
  });

  it('sinVacios quita los opcionales en blanco', () => {
    expect(
      sinVacios({ nivel: 'baja', incluye: '', edad_minima: null, cita_previa: false }),
    ).toEqual({ nivel: 'baja', cita_previa: false });
  });
});
