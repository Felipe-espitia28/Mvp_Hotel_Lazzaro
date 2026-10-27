// Pruebas unitarias del dominio de tarifas: sin base de datos ni NestJS.
import { domingoDePascua, festivosDeColombia } from './calendario-colombia';
import { periodosDelAnio, temporadaDeNoche } from './temporadas';
import {
  cotizar,
  recortarDesglose,
  valorPrimeraNoche,
  CapacidadExcedidaError,
  REGLAS_POR_DEFECTO,
} from './motor-tarificacion';

const d = (iso: string) => new Date(iso);
const iso = (fecha: Date) => fecha.toISOString().slice(0, 10);

describe('Calendario de Colombia', () => {
  it.each([
    [2026, '2026-04-05'],
    [2027, '2027-03-28'],
    [2028, '2028-04-16'],
    [2030, '2030-04-21'],
  ])('Pascua %i es el %s', (anio, esperado) => {
    expect(iso(domingoDePascua(anio))).toBe(esperado);
  });

  it('calcula los 18 festivos de 2026 (con la Ley Emiliani)', () => {
    expect(festivosDeColombia(2026).map((f) => iso(f.fecha))).toEqual([
      '2026-01-01', // Año Nuevo
      '2026-01-12', // Reyes (6 ene, martes → lunes)
      '2026-03-23', // San José (19 mar, jueves → lunes)
      '2026-04-02', // Jueves Santo
      '2026-04-03', // Viernes Santo
      '2026-05-01', // Trabajo
      '2026-05-18', // Ascensión
      '2026-06-08', // Corpus Christi
      '2026-06-15', // Sagrado Corazón
      '2026-06-29', // San Pedro (ya es lunes)
      '2026-07-20', // Independencia
      '2026-08-07', // Boyacá
      '2026-08-17', // Asunción (15 ago, sábado → lunes)
      '2026-10-12', // Día de la Raza (ya es lunes)
      '2026-11-02', // Todos los Santos
      '2026-11-16', // Independencia de Cartagena
      '2026-12-08', // Inmaculada
      '2026-12-25', // Navidad
    ]);
  });
});

describe('Temporadas', () => {
  it.each([
    ['2026-12-15', 'alta', 'Temporada de fin de año'],
    ['2027-01-15', 'alta', 'Temporada de fin de año'],
    ['2027-01-16', 'baja', null],
    ['2026-06-20', 'alta', 'Vacaciones de mitad de año'],
    ['2027-03-21', 'alta', 'Semana Santa'], // Domingo de Ramos 2027
    ['2027-03-27', 'alta', 'Semana Santa'], // Sábado Santo
    ['2027-03-28', 'baja', null], // noche del Domingo de Pascua
    ['2026-10-09', 'media', 'Puente festivo: Día de la Raza'], // viernes
    ['2026-10-11', 'media', 'Puente festivo: Día de la Raza'], // domingo
    ['2026-10-12', 'baja', null], // la noche del lunes festivo ya no es puente
    ['2026-08-06', 'media', 'Puente festivo: Batalla de Boyacá'], // 7 ago es viernes: solo la víspera
    ['2026-10-20', 'baja', null],
  ])('la noche del %s es temporada %s', (noche, temporada, motivo) => {
    expect(temporadaDeNoche(d(noche))).toEqual({ temporada, motivo });
  });

  it('agrupa el calendario del año en periodos', () => {
    const periodos = periodosDelAnio(2027);
    const semanaSanta = periodos.find((p) => p.motivo === 'Semana Santa');
    expect(semanaSanta && [iso(semanaSanta.desde), iso(semanaSanta.hasta)]).toEqual([
      '2027-03-21',
      '2027-03-27',
    ]);
    expect(periodos.every((p) => p.temporada !== 'baja')).toBe(true);
  });
});

describe('Temporadas propias del hotel', () => {
  const sinCalculadas = { semanaSantaAlta: false, puentesFestivosMedia: false };

  it('un rango propio define la temporada y su nombre', () => {
    const config = {
      ...sinCalculadas,
      rangos: [
        { nombre: 'Festival de Jazz', temporada: 'media' as const, desde: 1005, hasta: 1010 },
      ],
    };
    expect(temporadaDeNoche(d('2026-10-07'), config)).toEqual({
      temporada: 'media',
      motivo: 'Festival de Jazz',
    });
    expect(temporadaDeNoche(d('2026-10-11'), config).temporada).toBe('baja');
  });

  it('un rango que cruza el fin de año cubre diciembre y enero', () => {
    const config = {
      ...sinCalculadas,
      rangos: [{ nombre: 'Navidad', temporada: 'alta' as const, desde: 1220, hasta: 110 }],
    };
    expect(temporadaDeNoche(d('2026-12-25'), config).temporada).toBe('alta');
    expect(temporadaDeNoche(d('2027-01-05'), config).temporada).toBe('alta');
    expect(temporadaDeNoche(d('2027-01-11'), config).temporada).toBe('baja');
  });

  it('el hotel puede apagar Semana Santa y los puentes', () => {
    const config = { ...sinCalculadas, rangos: [] };
    expect(temporadaDeNoche(d('2027-03-25'), config).temporada).toBe('baja'); // Semana Santa
    expect(temporadaDeNoche(d('2026-10-09'), config).temporada).toBe('baja'); // puente
  });

  it('una temporada alta propia gana sobre un puente festivo', () => {
    const config = {
      semanaSantaAlta: true,
      puentesFestivosMedia: true,
      rangos: [{ nombre: 'Feria', temporada: 'alta' as const, desde: 1009, hasta: 1011 }],
    };
    expect(temporadaDeNoche(d('2026-10-09'), config)).toEqual({
      temporada: 'alta',
      motivo: 'Feria',
    });
  });
});

describe('Motor de tarificación', () => {
  const doble = {
    tarifaBase: 100000,
    capacidadIncluida: 2,
    capacidadMaxima: 3,
    cargoPersonaAdicional: 40000,
    cargoNinoAdicional: 20000,
  };
  const solo = (adultos: number) => ({ adultos, edadesNinos: [] });

  it('cobra cada noche según su temporada (R14)', () => {
    // 13 dic (baja), 14 dic (baja), 15 dic (alta).
    const desglose = cotizar(doble, d('2026-12-13'), d('2026-12-16'), solo(2), true);

    expect(desglose.noches.map((n) => [n.fecha, n.temporada, n.tarifa])).toEqual([
      ['2026-12-13', 'baja', 100000],
      ['2026-12-14', 'baja', 100000],
      ['2026-12-15', 'alta', 130000],
    ]);
    expect(desglose.alojamiento).toBe(330000);
    expect(desglose.total).toBe(330000); // exento de IVA
  });

  it('suma personas adicionales e IVA del 19 %', () => {
    const desglose = cotizar(doble, d('2026-10-20'), d('2026-10-22'), solo(3), false);

    expect(desglose.personasAdicionales).toBe(1);
    expect(desglose.adicionales).toBe(2 * 40000);
    expect(desglose.subtotal).toBe(200000 + 80000);
    expect(desglose.iva).toEqual({ porcentaje: 19, valor: 53200, exento: false });
    expect(desglose.total).toBe(333200);
  });

  it('aplica el multiplicador de temporada media en un puente', () => {
    const desglose = cotizar(doble, d('2026-10-09'), d('2026-10-10'), solo(2), true);
    expect(desglose.noches[0]).toMatchObject({ temporada: 'media', tarifa: 115000 });
  });

  it('rechaza más huéspedes que la capacidad máxima (R6)', () => {
    expect(() => cotizar(doble, d('2026-10-20'), d('2026-10-21'), solo(4), false)).toThrow(
      CapacidadExcedidaError,
    );
  });

  it('al salir antes cobra solo las primeras noches, con su temporada (R24)', () => {
    // 14 dic (baja), 15 y 16 dic (alta); se va después de 2 noches.
    const pactado = cotizar(doble, d('2026-12-14'), d('2026-12-17'), solo(3), false);
    const usado = recortarDesglose(pactado, 2);

    expect(usado.noches.map((n) => n.fecha)).toEqual(['2026-12-14', '2026-12-15']);
    expect(usado.alojamiento).toBe(100000 + 130000);
    expect(usado.adicionales).toBe(2 * 40000);
    expect(usado.iva).toEqual({ porcentaje: 19, valor: 58900, exento: false });
    expect(usado.total).toBe(310000 + 58900);
  });

  it('la penalidad es la primera noche con adicionales e IVA', () => {
    const desglose = cotizar(doble, d('2026-12-15'), d('2026-12-18'), solo(3), false);
    // (130.000 alta + 40.000 adicional) × 1,19
    expect(valorPrimeraNoche(desglose)).toBe(202300);
  });

  describe('adultos y niños (A-3)', () => {
    // Por defecto: 0–4 gratis, 5–11 tarifa de niño, 12+ adulto.
    const familia = (edadesNinos: number[], adultos = 2) => ({ adultos, edadesNinos });
    const suite = { ...doble, capacidadMaxima: 4 };

    it('en una doble con 2 incluidos, el niño de 3 no paga y el de 8 paga su cargo', () => {
      const desglose = cotizar(suite, d('2026-10-20'), d('2026-10-22'), familia([3, 8]), true);

      expect(desglose.huespedes).toBe(4);
      expect(desglose.adultos).toBe(2);
      expect(desglose.ninos).toEqual({ gratis: 1, conCargo: 1 });
      expect(desglose.personasAdicionales).toBe(0);
      expect(desglose.ninosAdicionales).toBe(2 * 20000);
      expect(desglose.total).toBe(200000 + 40000);
    });

    it('un niño con cargo paga aunque quede un cupo incluido libre', () => {
      const desglose = cotizar(doble, d('2026-10-20'), d('2026-10-21'), familia([8], 1), true);
      expect([desglose.personasAdicionales, desglose.ninosAdicionales]).toEqual([0, 20000]);
    });

    it('quien ya cumplió 12 a la fecha de entrada paga como adulto', () => {
      const desglose = cotizar(doble, d('2026-10-20'), d('2026-10-21'), familia([12]), true);
      expect(desglose.ninos).toEqual({ gratis: 0, conCargo: 0 });
      expect([desglose.adultos, desglose.personasAdicionales]).toEqual([3, 1]);
      expect(desglose.adicionales).toBe(40000);
    });

    it('los niños con cargo suman al IVA, y la exención con pasaporte los incluye', () => {
      const conIva = cotizar(doble, d('2026-10-20'), d('2026-10-21'), familia([8]), false);
      expect(conIva.subtotal).toBe(100000 + 20000);
      expect(conIva.iva.valor).toBe(22800);
      const exento = cotizar(doble, d('2026-10-20'), d('2026-10-21'), familia([8]), true);
      expect([exento.iva.valor, exento.total]).toEqual([0, 120000]);
    });

    it('los niños gratis cuentan para la capacidad máxima (R6)', () => {
      expect(() => cotizar(doble, d('2026-10-20'), d('2026-10-21'), familia([1, 2]), true)).toThrow(
        CapacidadExcedidaError,
      );
    });

    it('usa los rangos del hotel y los deja en el desglose', () => {
      const reglas = { ...REGLAS_POR_DEFECTO, rangosEdad: { gratisHasta: 2, ninoHasta: 9 } };
      const desglose = cotizar(
        suite,
        d('2026-10-20'),
        d('2026-10-21'),
        familia([3, 10]),
        true,
        reglas,
      );
      expect(desglose.ninos).toEqual({ gratis: 0, conCargo: 1 });
      expect(desglose.rangosEdad).toEqual({ gratisHasta: 2, ninoHasta: 9 });
    });

    it('al salir antes y en la penalidad cobra también a los niños', () => {
      const pactado = cotizar(suite, d('2026-10-20'), d('2026-10-23'), familia([8]), false);
      const usado = recortarDesglose(pactado, 1);
      expect(usado.ninosAdicionales).toBe(20000);
      expect(usado.total).toBe(Math.round(120000 * 1.19));
      expect(valorPrimeraNoche(pactado)).toBe(Math.round(120000 * 1.19));
    });

    it('lee un desglose antiguo, sin los campos de niños', () => {
      const actual = cotizar(doble, d('2026-12-15'), d('2026-12-18'), solo(3), false);
      const antiguo = { ...actual } as Partial<typeof actual>;
      delete antiguo.adultos;
      delete antiguo.ninos;
      delete antiguo.cargoNinoPorNoche;
      delete antiguo.ninosAdicionales;
      delete antiguo.rangosEdad;
      const recortado = recortarDesglose(antiguo as typeof actual, 2);

      expect(recortado.total).toBe(recortarDesglose(actual, 2).total);
      expect(recortado).not.toHaveProperty('ninosAdicionales');
      expect(valorPrimeraNoche(antiguo as typeof actual)).toBe(202300);
    });
  });
});
