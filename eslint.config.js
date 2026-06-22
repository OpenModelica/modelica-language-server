// @ts-check
const eslint = require('@eslint/js');
const tseslint = require('@typescript-eslint/eslint-plugin');
const tsparser = require('@typescript-eslint/parser');
const globals = require('globals');

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'client/node_modules/**',
      'client/out/**',
      'server/node_modules/**',
      'server/out/**',
      'out/**',
    ],
  },
  {
    ...eslint.configs.recommended,
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs['recommended'].rules,
      'semi': [2, 'always'],
      'no-undef': 0,              // TypeScript's type checker handles this
      'no-redeclare': 0,          // @typescript-eslint/no-redeclare handles TS overloads
      'no-unused-private-class-members': 0,
      '@typescript-eslint/no-unused-vars': [1, {
        'argsIgnorePattern': '^_',
        'varsIgnorePattern': '^_',
        'caughtErrorsIgnorePattern': '^_',
      }],
      '@typescript-eslint/no-explicit-any': 1,
      '@typescript-eslint/explicit-module-boundary-types': 1,
      '@typescript-eslint/no-non-null-assertion': 0,
      '@typescript-eslint/no-unused-expressions': 0,
    },
  },
];
