// Pruebas unitarias del dominio de tarifas: sin base de datos ni NestJS.
import { domingoDePascua, festivosDeColombia } from './calendario-colombia';
import { periodosDelAnio, temporadaDeNoche } from './temporadas';
import { cotizar, valorPrimeraNoche, CapacidadExcedidaError } from './motor-tarificacion';

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

describe('Motor de tarificación', () => {
  const doble = {
    tarifaBase: 100000,
    capacidadIncluida: 2,
    capacidadMaxima: 3,
    cargoPersonaAdicional: 40000,
  };

  it('cobra cada noche según su temporada (R14)', () => {
    // 13 dic (baja), 14 dic (baja), 15 dic (alta).
    const desglose = cotizar(doble, d('2026-12-13'), d('2026-12-16'), 2, true);

    expect(desglose.noches.map((n) => [n.fecha, n.temporada, n.tarifa])).toEqual([
      ['2026-12-13', 'baja', 100000],
      ['2026-12-14', 'baja', 100000],
      ['2026-12-15', 'alta', 130000],
    ]);
    expect(desglose.alojamiento).toBe(330000);
    expect(desglose.total).toBe(330000); // exento de IVA
  });

  it('suma personas adicionales e IVA del 19 %', () => {
    const desglose = cotizar(doble, d('2026-10-20'), d('2026-10-22'), 3, false);

    expect(desglose.personasAdicionales).toBe(1);
    expect(desglose.adicionales).toBe(2 * 40000);
    expect(desglose.subtotal).toBe(200000 + 80000);
    expect(desglose.iva).toEqual({ porcentaje: 19, valor: 53200, exento: false });
    expect(desglose.total).toBe(333200);
  });

  it('aplica el multiplicador de temporada media en un puente', () => {
    const desglose = cotizar(doble, d('2026-10-09'), d('2026-10-10'), 2, true);
    expect(desglose.noches[0]).toMatchObject({ temporada: 'media', tarifa: 115000 });
  });

  it('rechaza más huéspedes que la capacidad máxima (R6)', () => {
    expect(() => cotizar(doble, d('2026-10-20'), d('2026-10-21'), 4, false)).toThrow(
      CapacidadExcedidaError,
    );
  });

  it('la penalidad es la primera noche con adicionales e IVA', () => {
    const desglose = cotizar(doble, d('2026-12-15'), d('2026-12-18'), 3, false);
    // (130.000 alta + 40.000 adicional) × 1,19
    expect(valorPrimeraNoche(desglose)).toBe(202300);
  });
});
