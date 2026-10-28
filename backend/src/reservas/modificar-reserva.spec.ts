import { cotizar } from '../tarifas/motor-tarificacion';
import {
  detalleModificacion,
  fechasDeNoches,
  nochesEliminadas,
  penalidadPorAcortar,
} from './modificar-reserva';

const d = (iso: string) => new Date(iso);
const doble = {
  tarifaBase: 100000,
  capacidadIncluida: 2,
  capacidadMaxima: 3,
  cargoPersonaAdicional: 40000,
  cargoNinoAdicional: 20000,
};

describe('Modificar una reserva: ayudantes', () => {
  it('las noches de una estadía y las que se eliminan', () => {
    expect(fechasDeNoches(d('2030-03-10'), d('2030-03-13'))).toEqual([
      '2030-03-10',
      '2030-03-11',
      '2030-03-12',
    ]);
    const pactada = { fechaEntrada: d('2030-03-10'), fechaSalida: d('2030-03-14') };
    expect(
      nochesEliminadas(pactada, { fechaEntrada: d('2030-03-11'), fechaSalida: d('2030-03-13') }),
    ).toEqual(['2030-03-10', '2030-03-13']);
    expect(
      nochesEliminadas(pactada, { fechaEntrada: d('2030-03-10'), fechaSalida: d('2030-03-16') }),
    ).toEqual([]);
  });

  it('la penalidad por acortar: las noches de penalidad sobre las eliminadas, con adicionales e IVA', () => {
    // 3 adultos (1 adicional) y 19 % de IVA: (100.000 + 40.000) × 1,19 = 166.600 por noche.
    const desglose = cotizar(
      doble,
      d('2026-10-20'),
      d('2026-10-24'),
      { adultos: 3, edadesNinos: [] },
      false,
    );
    const reserva = { desglose, valorAlojamiento: desglose.total, noches: 4 };
    expect(penalidadPorAcortar(reserva, ['2026-10-22', '2026-10-23'], 1)).toBe(166600);
    expect(penalidadPorAcortar(reserva, ['2026-10-22', '2026-10-23'], 3)).toBe(333200);
    expect(penalidadPorAcortar(reserva, [], 1)).toBe(0);
    // Sin desglose (reservas antiguas): el promedio por noche.
    expect(
      penalidadPorAcortar({ desglose: null, valorAlojamiento: 400000, noches: 4 }, ['x'], 1),
    ).toBe(100000);
  });

  it('el detalle de la auditoría cuenta solo lo que cambió', () => {
    const antes = {
      fechaEntrada: '2030-03-10',
      fechaSalida: '2030-03-12',
      habitacion: '101',
      adultos: 2,
      edadesNinos: [],
      total: 260000,
    };
    expect(detalleModificacion(antes, { ...antes, fechaSalida: '2030-03-14', total: 520000 })).toBe(
      'Fechas 2030-03-10 a 2030-03-12 → 2030-03-10 a 2030-03-14 · Total $260.000 → $520.000',
    );
    expect(detalleModificacion(antes, { ...antes, habitacion: '201', edadesNinos: [8] })).toBe(
      'Habitación 101 → 201 · 2 adultos → 2 adultos y 1 niño (8) · Total $260.000 → $260.000',
    );
  });
});
