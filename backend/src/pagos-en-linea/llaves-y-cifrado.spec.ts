import { randomBytes } from 'node:crypto';
import { cifrar, descifrar } from './cifrado';
import { ambienteDe, problemaConLlaves } from './llaves';
import { proveedorActivo, verificarPasarelaParaProduccion } from './pasarelas';

const LLAVES_PRUEBAS = {
  llavePublica: 'pub_test_abc',
  llavePrivada: 'prv_test_abc',
  secretoEventos: 'test_events_abc',
  secretoIntegridad: 'test_integrity_abc',
};

describe('Llaves de Wompi', () => {
  it('deduce el ambiente del prefijo de la llave pública', () => {
    expect(ambienteDe('pub_test_abc')).toBe('pruebas');
    expect(ambienteDe('pub_prod_abc')).toBe('produccion');
    expect(ambienteDe('otra')).toBeNull();
  });

  it('acepta solo llaves de pruebas con el formato de Wompi', () => {
    expect(problemaConLlaves(LLAVES_PRUEBAS)).toBeNull();
    expect(problemaConLlaves({ ...LLAVES_PRUEBAS, llavePublica: 'pub_prod_abc' })).toMatch(
      /producción/,
    );
    expect(problemaConLlaves({ ...LLAVES_PRUEBAS, secretoEventos: 'prod_events_abc' })).toMatch(
      /producción/,
    );
    expect(problemaConLlaves({ ...LLAVES_PRUEBAS, llavePrivada: 'pub_test_abc' })).toMatch(
      /prv_test_/,
    );
    expect(problemaConLlaves({ ...LLAVES_PRUEBAS, secretoIntegridad: 'test_integrity_' })).toMatch(
      /formato/,
    );
  });
});

describe('Cifrado de las llaves', () => {
  const llave = randomBytes(32);

  it('cifra y descifra; el texto cifrado no contiene el original y cambia cada vez', () => {
    const cifrado = cifrar('prv_test_secreta', llave);
    expect(cifrado).not.toContain('prv_test_secreta');
    expect(cifrar('prv_test_secreta', llave)).not.toBe(cifrado);
    expect(descifrar(cifrado, llave)).toBe('prv_test_secreta');
  });

  it('no descifra con otra llave ni si se altera', () => {
    const cifrado = cifrar('prv_test_secreta', llave);
    expect(() => descifrar(cifrado, randomBytes(32))).toThrow();
    const partes = cifrado.split(':');
    partes[3] = Buffer.from('otra cosa').toString('base64');
    expect(() => descifrar(partes.join(':'), llave)).toThrow();
  });

  it('exige una llave maestra de 32 bytes', () => {
    expect(() => cifrar('x', null)).toThrow('CLAVE_CIFRADO_PAGOS');
  });
});

describe('Interruptor de la pasarela', () => {
  it('por defecto es la simulada y rechaza valores desconocidos', () => {
    expect(proveedorActivo({})).toBe('simulada');
    expect(proveedorActivo({ PASARELA_PROVEEDOR: 'wompi' })).toBe('wompi');
    expect(() => proveedorActivo({ PASARELA_PROVEEDOR: 'otra' })).toThrow();
  });

  it('en producción la pasarela simulada impide arrancar', () => {
    expect(() => verificarPasarelaParaProduccion({ NODE_ENV: 'production' })).toThrow(/simulada/);
    expect(() =>
      verificarPasarelaParaProduccion({ NODE_ENV: 'production', PASARELA_PROVEEDOR: 'wompi' }),
    ).not.toThrow();
    expect(() => verificarPasarelaParaProduccion({ NODE_ENV: 'development' })).not.toThrow();
  });
});
