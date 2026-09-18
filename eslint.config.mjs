import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import prettierConfig from 'eslint-config-prettier';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

/**
 * Flat config.
 *
 * Type-unaware on purpose: `npm run typecheck` runs the compiler over the whole
 * project and reports type problems with far better precision than a lint rule
 * can. Linting here is for the things the compiler does not check — unused
 * imports, React hook dependencies, and Next's own routing and image rules.
 */
const config = [
  {
    ignores: ['next-env.d.ts', '.next/**', 'node_modules/**', 'out/**', 'playwright-report/**', 'test-results/**'],
  },
  js.configs.recommended,

  // Next's rules cover the App Router mistakes that are invisible until
  // production: a client hook in a server component, a raw <a> for an internal
  // route, an unoptimised image on a page that ships to a phone.
  ...compat.extends('next/core-web-vitals'),

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      ...tsPlugin.configs.recommended.rules,

      // The compiler already reports these, with types.
      'no-unused-vars': 'off',
      'no-undef': 'off',
      'no-redeclare': 'off',

      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
    },
  },

  {
    files: ['e2e/**/*.ts'],
    rules: {
      // Playwright specs legitimately await inside loops when stepping through
      // a flow; the sequencing is the point.
      'no-await-in-loop': 'off',

      // Playwright's fixture API takes a callback named `use`, which the React
      // rule mistakes for the `use` hook. There is no React in this directory.
      'react-hooks/rules-of-hooks': 'off',
    },
  },

  prettierConfig,
];

export default config;
