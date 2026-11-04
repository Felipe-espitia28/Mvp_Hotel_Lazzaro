import { debePublicarDocumentacion } from './documentacion';

// D-13: /docs no se publica en producción salvo que se pida.
describe('Publicación de la documentación de la API', () => {
  it('se publica en desarrollo y cuando no se indica el ambiente', () => {
    expect(debePublicarDocumentacion({ NODE_ENV: 'development' })).toBe(true);
    expect(debePublicarDocumentacion({})).toBe(true);
  });

  it('no se publica en producción', () => {
    expect(debePublicarDocumentacion({ NODE_ENV: 'production' })).toBe(false);
  });

  it('PUBLICAR_DOCS=true la publica también en producción', () => {
    expect(debePublicarDocumentacion({ NODE_ENV: 'production', PUBLICAR_DOCS: 'true' })).toBe(true);
  });

  it('PUBLICAR_DOCS=false la apaga en cualquier ambiente', () => {
    expect(debePublicarDocumentacion({ NODE_ENV: 'development', PUBLICAR_DOCS: 'false' })).toBe(
      false,
    );
  });
});
