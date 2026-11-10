import { describe, expect, it } from 'vitest';
import { cumpleTodo, reglasContrasena } from './contrasena';

describe('política de contraseñas (R72)', () => {
  const contexto = { email: 'rosa.perez@hotel.co', temporal: 'Abc23456defg' };
  const fallan = (nueva: string) =>
    reglasContrasena(nueva, contexto)
      .filter((r) => !r.cumple)
      .map((r) => r.texto);

  it('acepta una contraseña larga con letras y números', () => {
    expect(cumpleTodo(reglasContrasena('montaña2026verde', contexto))).toBe(true);
  });

  it('marca cada regla que falla', () => {
    expect(fallan('corta1')).toEqual(['Al menos 10 caracteres']);
    expect(fallan('solamenteletras')).toEqual(['Letras y números']);
    expect(fallan('Abc23456defg')).toEqual(['Distinta de la temporal']);
    expect(fallan('ROSA.PEREZ2026')).toEqual(['Sin tu correo']);
  });

  it('sin temporal (cambio voluntario o recuperación) no pide esa regla', () => {
    expect(reglasContrasena('montaña2026verde', { email: 'a@b.co' })).toHaveLength(3);
  });
});
