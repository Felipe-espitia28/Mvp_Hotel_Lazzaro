import { LARGO_TEMPORAL, generarContrasenaTemporal, problemaConContrasena } from './contrasenas';

describe('Contraseña temporal', () => {
  it('tiene 12 caracteres sin los que se confunden (0/O, 1/l/I)', () => {
    for (let i = 0; i < 50; i++) {
      const temporal = generarContrasenaTemporal();
      expect(temporal).toHaveLength(LARGO_TEMPORAL);
      expect(temporal).not.toMatch(/[0O1lI]/);
    }
  });

  it('dos llamadas dan valores distintos', () => {
    expect(generarContrasenaTemporal()).not.toBe(generarContrasenaTemporal());
  });
});

describe('Política de contraseñas (R72)', () => {
  const contexto = { email: 'rosa.perez@hotel.co', temporal: 'Abc23456defg' };

  it('acepta una contraseña larga con letras y números', () => {
    expect(problemaConContrasena('montaña2026verde', contexto)).toBeNull();
  });

  it('exige al menos 10 caracteres', () => {
    expect(problemaConContrasena('corta12', contexto)).toMatch(/10 caracteres/);
  });

  it('exige letras y números', () => {
    expect(problemaConContrasena('solamenteletras', contexto)).toMatch(/letras y números/);
    expect(problemaConContrasena('1234567890', contexto)).toMatch(/letras y números/);
  });

  it('no puede ser la temporal', () => {
    expect(problemaConContrasena('Abc23456defg', contexto)).toMatch(/temporal/);
  });

  it('no puede contener la parte local del correo', () => {
    expect(problemaConContrasena('ROSA.PEREZ2026', contexto)).toMatch(/correo/);
  });
});
