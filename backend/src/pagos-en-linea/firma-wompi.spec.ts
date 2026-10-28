import eventoDeEjemplo from '../../test/fixtures/wompi/evento-transaccion-actualizada.json';
import {
  cadenaDeEvento,
  checksumDeEvento,
  firmaDeIntegridad,
  firmarEvento,
  leerEventoWompi,
  verificarFirma,
} from './firma-wompi';

// El ejemplo de la documentación de Wompi ("Eventos" y "Widget & Checkout Web").
const SECRETO_EJEMPLO = 'prod_events_OcHnIzeBl5socpwByQ4hA52Em3USQ93Z';

describe('Firma de los eventos de Wompi', () => {
  it('concatena los valores de signature.properties, el timestamp y el secreto como el ejemplo oficial', () => {
    const { data, signature, timestamp } = eventoDeEjemplo;
    expect(cadenaDeEvento(data, signature.properties, timestamp, SECRETO_EJEMPLO)).toBe(
      '1234-1610641025-49201APPROVED44900001530291411prod_events_OcHnIzeBl5socpwByQ4hA52Em3USQ93Z',
    );
    // SHA256 de esa cadena. El checksum impreso en la documentación (3476DDA5…)
    // no es el SHA256 de su propia cadena: se revisa con un evento real del
    // sandbox (paso 9 de docs/PASARELA_WOMPI.md).
    expect(checksumDeEvento(data, signature.properties, timestamp, SECRETO_EJEMPLO)).toBe(
      '5a18ec5e8fdb7df463e9f94774cba8f583ba21bd04a09ceff2ea68a4bc0aefbe',
    );
  });

  it('verifica un evento firmado (sin importar mayúsculas) y rechaza uno alterado', () => {
    const { signature, ...sinFirma } = eventoDeEjemplo;
    const firmado = firmarEvento(sinFirma, signature.properties, SECRETO_EJEMPLO);
    expect(verificarFirma(firmado, SECRETO_EJEMPLO)).toBe(true);
    const enMayusculas = {
      ...firmado,
      signature: { ...firmado.signature, checksum: firmado.signature.checksum.toUpperCase() },
    };
    expect(verificarFirma(enMayusculas, SECRETO_EJEMPLO)).toBe(true);

    expect(verificarFirma(firmado, 'otro_secreto')).toBe(false);
    const otroMonto = {
      ...firmado,
      data: { transaction: { ...eventoDeEjemplo.data.transaction, amount_in_cents: 100 } },
    };
    expect(verificarFirma(otroMonto, SECRETO_EJEMPLO)).toBe(false);
    expect(verificarFirma({ cualquier: 'cosa' }, SECRETO_EJEMPLO)).toBe(false);
  });

  it('lee la transacción del evento solo si la firma es válida', () => {
    const { signature, ...sinFirma } = eventoDeEjemplo;
    const firmado = firmarEvento(sinFirma, signature.properties, SECRETO_EJEMPLO);
    expect(leerEventoWompi(firmado, SECRETO_EJEMPLO)).toEqual({
      firmaValida: true,
      transaccion: {
        id: '1234-1610641025-49201',
        referencia: 'MZQ3X2DE2SMX',
        montoEnCentavos: 4490000,
        moneda: 'COP',
        estado: 'aprobada',
      },
    });
    expect(leerEventoWompi(firmado, 'otro')).toEqual({ firmaValida: false, transaccion: null });
    const otroEvento = firmarEvento(
      { ...sinFirma, event: 'nequi_token.updated' },
      signature.properties,
      SECRETO_EJEMPLO,
    );
    expect(leerEventoWompi(otroEvento, SECRETO_EJEMPLO).transaccion).toBeNull();
  });
});

describe('Firma de integridad del Web Checkout', () => {
  it('da el mismo resultado que el ejemplo oficial', () => {
    expect(
      firmaDeIntegridad({
        referencia: 'sk8-438k4-xmxm392-sn2m2',
        montoEnCentavos: 490000,
        moneda: 'COP',
        secretoIntegridad: 'prod_integrity_Z5mMke9x0k8gpErbDqwrJXMqsI6SFli6',
      }),
    ).toBe('37c8407747e595535433ef8f6a811d853cd943046624a0ec04662b17bbf33bf5');
  });

  it('con expiración, la fecha va antes del secreto', () => {
    const conFecha = firmaDeIntegridad({
      referencia: 'sk8-438k4-xmxm392-sn2m2',
      montoEnCentavos: 490000,
      moneda: 'COP',
      expiraEn: '2023-06-09T20:28:50.000Z',
      secretoIntegridad: 'prod_integrity_Z5mMke9x0k8gpErbDqwrJXMqsI6SFli6',
    });
    expect(conFecha).toMatch(/^[0-9a-f]{64}$/);
    expect(conFecha).not.toBe('37c8407747e595535433ef8f6a811d853cd943046624a0ec04662b17bbf33bf5');
  });
});
