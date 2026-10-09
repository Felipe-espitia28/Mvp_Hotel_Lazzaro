// Reglas de calidad para todo el repositorio (backend NestJS y frontend React).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/*.config.*'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      // Variables que empiezan con "_" se ignoran a propósito (p. ej. desestructurar para descartar).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },

  {
    files: ['backend/**/*.ts'],
    languageOptions: { globals: { ...globals.node, ...globals.jest } },
  },

  {
    files: ['frontend/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },

  // Desactiva las reglas de estilo que se ocupan de Prettier.
  prettier,
);
