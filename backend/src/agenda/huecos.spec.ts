// Pruebas unitarias de los horarios y huecos de la agenda (S-2).
import { dentroDelHorario, horaDelHotel, huecosLibres, instanteDelDia } from './huecos';

// 2030-03-11 es lunes. Las horas son del hotel (UTC-5).
const a = (hora: string, fecha = '2030-03-11') => new Date(`${fecha}T${hora}:00-05:00`);
const horas = (huecos: { inicio: Date }[]) =>
  huecos.map((h) => {
    const m = horaDelHotel(h.inicio).minuto;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  });

const SPA = { dias: [1, 2, 3, 4, 5], desde: '09:00', hasta: '12:00' };

describe('Horario del servicio', () => {
  it('convierte las horas del hotel', () => {
    expect(instanteDelDia('2030-03-11', 9 * 60)).toEqual(a('09:00'));
    expect(horaDelHotel(a('23:30'))).toEqual({
      fecha: '2030-03-11',
      minuto: 23 * 60 + 30,
      diaSemana: 1,
    });
  });

  it('la cita debe empezar después de abrir y terminar antes de cerrar', () => {
    expect(dentroDelHorario(SPA, a('09:00'), a('10:00'))).toBe(true);
    expect(dentroDelHorario(SPA, a('11:00'), a('12:00'))).toBe(true);
    expect(dentroDelHorario(SPA, a('08:45'), a('09:45'))).toBe(false);
    expect(dentroDelHorario(SPA, a('11:30'), a('12:30'))).toBe(false);
  });

  it('solo los días del horario (el domingo no)', () => {
    expect(dentroDelHorario(SPA, a('10:00', '2030-03-17'), a('11:00', '2030-03-17'))).toBe(false);
  });

  it('sin horario, a cualquier hora', () => {
    expect(dentroDelHorario(null, a('03:00'), a('04:00'))).toBe(true);
  });
});

describe('Huecos libres', () => {
  const base = { fecha: '2030-03-11', disponibilidad: SPA, duracionMinutos: 60, margenMinutos: 15 };

  it('sin citas, todas las franjas de 15 minutos donde cabe la cita', () => {
    expect(horas(huecosLibres({ ...base, ocupados: [] }))).toEqual([
      '09:00',
      '09:15',
      '09:30',
      '09:45',
      '10:00',
      '10:15',
      '10:30',
      '10:45',
      '11:00',
    ]);
  });

  it('respeta el margen de limpieza antes y después de una cita existente', () => {
    // Cita de 10:00 a 11:00: ocupa el recurso hasta las 11:15.
    const ocupados = [{ inicio: a('10:00'), finOcupado: a('11:15') }];
    // Una cita nueva de una hora ocupa 60 + 15 minutos: a las 09:00 llegaría
    // hasta las 10:15 (se cruza) y a las 11:15 terminaría después del cierre.
    expect(horas(huecosLibres({ ...base, ocupados }))).toEqual([]);
    // Con media hora de servicio: 09:00 (ocupa hasta 09:45) y 09:15 (hasta
    // 10:00, justo cuando empieza la otra); después, desde las 11:15.
    expect(horas(huecosLibres({ ...base, duracionMinutos: 30, ocupados }))).toEqual([
      '09:00',
      '09:15',
      '11:15',
      '11:30',
    ]);
  });

  it('no ofrece los huecos que ya pasaron', () => {
    expect(horas(huecosLibres({ ...base, ocupados: [], noAntesDe: a('10:20') }))).toEqual([
      '10:30',
      '10:45',
      '11:00',
    ]);
  });

  it('un día fuera del horario no tiene huecos', () => {
    expect(huecosLibres({ ...base, fecha: '2030-03-17', ocupados: [] })).toEqual([]);
  });
});
