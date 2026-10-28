import comercio from '../../test/fixtures/wompi/comercio.json';
import transacciones from '../../test/fixtures/wompi/transacciones-por-referencia.json';
import { firmaDeIntegridad } from './firma-wompi';
import { LlavesWompi } from './llaves';
import { PasarelaWompi, URL_CHECKOUT_WOMPI } from './wompi.adaptador';

// B-2: el adaptador de Wompi, sin red: un fetch falso devuelve respuestas con
// la forma de la documentación (test/fixtures/wompi).
const LLAVES: LlavesWompi = {
  llavePublica: 'pub_test_Q5yDA9xoKdePzhSGeVe9HAez7HgGORGf',
  llavePrivada: 'prv_test_ejemplo',
  secretoEventos: 'test_events_ejemplo',
  secretoIntegridad: 'test_integrity_ejemplo',
};

function fetchFalso(cuerpo: unknown, status = 200) {
  const llamadas: { url: string; init?: RequestInit }[] = [];
  const pedir = (url: string, init?: RequestInit) => {
    llamadas.push({ url, init });
    return Promise.resolve(new Response(JSON.stringify(cuerpo), { status }));
  };
  return { pedir, llamadas };
}

describe('Adaptador de Wompi', () => {
  it('arma la URL del Web Checkout: centavos, COP, referencia, firma, retorno y expiración', async () => {
    const wompi = new PasarelaWompi(LLAVES, 'pruebas');
    const expiraEn = new Date('2030-01-03T17:00:00.000Z');
    const url = new URL(
      await wompi.crearLinkDePago({
        referencia: 'PG3F9A1C2B7D4E',
        monto: 48000,
        urlRetorno: 'http://localhost:5173/pago-resultado?referencia=PG3F9A1C2B7D4E',
        expiraEn,
      }),
    );
    expect(`${url.origin}${url.pathname}`).toBe(URL_CHECKOUT_WOMPI);
    const p = url.searchParams;
    expect(p.get('public-key')).toBe(LLAVES.llavePublica);
    expect(p.get('currency')).toBe('COP');
    expect(p.get('amount-in-cents')).toBe('4800000');
    expect(p.get('reference')).toBe('PG3F9A1C2B7D4E');
    expect(p.get('redirect-url')).toBe(
      'http://localhost:5173/pago-resultado?referencia=PG3F9A1C2B7D4E',
    );
    expect(p.get('expiration-time')).toBe('2030-01-03T17:00:00.000Z');
    expect(p.get('signature:integrity')).toBe(
      firmaDeIntegridad({
        referencia: 'PG3F9A1C2B7D4E',
        montoEnCentavos: 4800000,
        moneda: 'COP',
        expiraEn: '2030-01-03T17:00:00.000Z',
        secretoIntegridad: LLAVES.secretoIntegridad,
      }),
    );
    // La llave privada nunca va en el link.
    expect(url.toString()).not.toContain(LLAVES.llavePrivada);
  });

  it.each([
    ['APPROVED', 'aprobada'],
    ['DECLINED', 'rechazada'],
    ['VOIDED', 'rechazada'],
    ['ERROR', 'rechazada'],
    ['PENDING', 'pendiente'],
  ])('consultarTransaccion traduce %s como %s', async (status, estado) => {
    const { pedir, llamadas } = fetchFalso({
      ...transacciones,
      data: [{ ...transacciones.data[0], status }],
    });
    const wompi = new PasarelaWompi(LLAVES, 'pruebas', pedir);
    expect(await wompi.consultarTransaccion('PG3F9A1C2B7D4E')).toEqual({
      id: '11854-1718985000-12345',
      referencia: 'PG3F9A1C2B7D4E',
      montoEnCentavos: 4800000,
      moneda: 'COP',
      estado,
    });
    expect(llamadas[0].url).toBe(
      'https://sandbox.wompi.co/v1/transactions?reference=PG3F9A1C2B7D4E',
    );
    expect(llamadas[0].init?.headers).toEqual({ Authorization: `Bearer ${LLAVES.llavePrivada}` });
  });

  it('con varios intentos cuenta el aprobado; sin transacciones devuelve null', async () => {
    const rechazada = { ...transacciones.data[0], id: 'tx-1', status: 'DECLINED' };
    const aprobada = { ...transacciones.data[0], id: 'tx-2', status: 'APPROVED' };
    const varias = new PasarelaWompi(
      LLAVES,
      'pruebas',
      fetchFalso({ data: [aprobada, rechazada] }).pedir,
    );
    expect((await varias.consultarTransaccion('PG3F9A1C2B7D4E'))?.id).toBe('tx-2');

    const vacia = new PasarelaWompi(LLAVES, 'pruebas', fetchFalso({ data: [] }).pedir);
    expect(await vacia.consultarTransaccion('PG3F9A1C2B7D4E')).toBeNull();

    const caida = new PasarelaWompi(LLAVES, 'pruebas', fetchFalso({}, 500).pedir);
    await expect(caida.consultarTransaccion('PG3F9A1C2B7D4E')).rejects.toThrow('500');
  });

  it('probarConexion consulta el comercio de la llave pública', async () => {
    const { pedir, llamadas } = fetchFalso(comercio);
    const wompi = new PasarelaWompi(LLAVES, 'pruebas', pedir);
    expect(await wompi.probarConexion()).toEqual({
      ok: true,
      mensaje: 'Conectado con el comercio Hotel de prueba S.A.S.',
    });
    expect(llamadas[0].url).toBe(`https://sandbox.wompi.co/v1/merchants/${LLAVES.llavePublica}`);

    const malas = new PasarelaWompi(LLAVES, 'pruebas', fetchFalso({}, 404).pedir);
    expect((await malas.probarConexion()).ok).toBe(false);
  });
});
