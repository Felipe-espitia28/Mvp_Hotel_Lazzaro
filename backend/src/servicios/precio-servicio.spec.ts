import { DatosDePrecioError, PrecioDeServicio, precioDelServicio } from './precio-servicio';

const RANGOS = { gratisHasta: 4, ninoHasta: 11 };
const servicio = (cambios: Partial<PrecioDeServicio>): PrecioDeServicio => ({
  nombre: 'Servicio',
  modoPrecio: 'fijo',
  precio: 6000,
  precioNino: null,
  ...cambios,
});

describe('precioDelServicio', () => {
  it('fijo: precio × cantidad', () => {
    expect(precioDelServicio(servicio({ nombre: 'Agua' }), { cantidad: 3 }, RANGOS)).toEqual({
      cantidad: 3,
      valorUnitario: 6000,
      total: 18000,
      concepto: 'Agua',
    });
  });

  it('por persona: precio × personas', () => {
    const masaje = servicio({ nombre: 'Masaje', modoPrecio: 'por_persona', precio: 120000 });
    expect(precioDelServicio(masaje, { cantidad: 2 }, RANGOS)).toEqual({
      cantidad: 2,
      valorUnitario: 120000,
      total: 240000,
      concepto: 'Masaje (2 personas)',
    });
  });

  it('por edad: adultos, niños con cargo y un niño gratis según los rangos del hotel', () => {
    const tour = servicio({
      nombre: 'Tour en lancha',
      modoPrecio: 'por_edad',
      precio: 90000,
      precioNino: 45000,
    });
    // 3 años: gratis; 8: niño; 14: paga como adulto.
    expect(precioDelServicio(tour, { adultos: 2, edadesNinos: [3, 8, 14] }, RANGOS)).toEqual({
      cantidad: 1,
      valorUnitario: 315000,
      total: 315000,
      concepto: 'Tour en lancha (3 adultos, 1 niño, 1 sin costo)',
    });
    // Con otros rangos, el de 3 años ya paga como niño.
    expect(
      precioDelServicio(tour, { adultos: 1, edadesNinos: [3] }, { gratisHasta: 2, ninoHasta: 9 })
        .total,
    ).toBe(135000);
  });

  it('pide la cantidad o las personas', () => {
    expect(() => precioDelServicio(servicio({}), {}, RANGOS)).toThrow(DatosDePrecioError);
    expect(() =>
      precioDelServicio(servicio({ modoPrecio: 'por_edad' }), { adultos: 0 }, RANGOS),
    ).toThrow('Indica al menos una persona');
  });
});
