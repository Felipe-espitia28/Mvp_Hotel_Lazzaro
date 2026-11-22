import { LARGO_MINIMO_SECRETO, validarSecretoJwt } from './secreto-jwt';

describe('Validación de JWT_SECRET', () => {
  it('acepta un secreto largo y aleatorio', () => {
    const secreto = 'k3Vq9xZp0Lw8TnRa5YdFhJ2mBcUe7GsX';
    expect(validarSecretoJwt(secreto)).toBe(secreto);
  });

  it('rechaza un secreto ausente o vacío', () => {
    expect(() => validarSecretoJwt(undefined)).toThrow(/Falta la variable/);
    expect(() => validarSecretoJwt('')).toThrow(/Falta la variable/);
  });

  it('rechaza el valor de ejemplo de .env.example', () => {
    expect(() => validarSecretoJwt('cambia-este-valor-por-uno-largo-y-aleatorio')).toThrow(
      /valor de ejemplo/,
    );
  });

  it('rechaza secretos de menos de 32 caracteres', () => {
    const corto = 'a'.repeat(LARGO_MINIMO_SECRETO - 1);
    expect(() => validarSecretoJwt(corto)).toThrow(/al menos 32 caracteres/);
  });

  it('acepta uno de exactamente 32 caracteres', () => {
    const justo = 'a'.repeat(LARGO_MINIMO_SECRETO);
    expect(validarSecretoJwt(justo)).toBe(justo);
  });
});
