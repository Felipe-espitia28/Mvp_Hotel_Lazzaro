import { describe, expect, it } from 'vitest';
import {
  franjaOcupada,
  franjasDelDia,
  instanteDelHotel,
  minutoDelHotel,
  textoHora,
  transicionesDe,
  ubicarCita,
} from './agenda';

// Una cita de 09:30 a 10:30 (hora del hotel), con 15 minutos de limpieza.
const cita = {
  inicio: '2030-03-11T14:30:00.000Z',
  fin: '2030-03-11T15:30:00.000Z',
  finOcupado: '2030-03-11T15:45:00.000Z',
  estado: 'agendada' as const,
};

describe('agenda', () => {
  it('pasa entre la hora del hotel y los instantes', () => {
    expect(minutoDelHotel(cita.inicio)).toBe(9 * 60 + 30);
    expect(textoHora(9 * 60 + 30)).toBe('09:30');
    expect(instanteDelHotel('2030-03-11', 9 * 60 + 30)).toBe('2030-03-11T09:30:00-05:00');
  });

  it('arma las franjas de 15 minutos', () => {
    expect(franjasDelDia(8 * 60, 9 * 60).map(textoHora)).toEqual([
      '08:00',
      '08:15',
      '08:30',
      '08:45',
    ]);
  });

  it('ubica la cita en la grilla (la fila 1 es el encabezado)', () => {
    // Desde las 08:00: 09:30 es la franja 6 → fila 8; una hora son 4 franjas.
    expect(ubicarCita(cita, 8 * 60)).toEqual({ fila: 8, franjas: 4 });
  });

  it('una franja dentro de la cita o de su margen está ocupada', () => {
    expect(franjaOcupada(9 * 60 + 15, [cita])).toBe(false);
    expect(franjaOcupada(10 * 60 + 30, [cita])).toBe(true); // limpieza
    expect(franjaOcupada(10 * 60 + 45, [cita])).toBe(false);
    expect(franjaOcupada(10 * 60, [{ ...cita, estado: 'cancelada' }])).toBe(false);
  });

  it('solo ofrece los cambios de estado permitidos', () => {
    expect(transicionesDe('en_curso')).toEqual(['realizada', 'cancelada']);
    expect(transicionesDe('realizada')).toEqual([]);
  });
});
