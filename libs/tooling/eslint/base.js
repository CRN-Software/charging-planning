import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Shared flat config. Packages extend it: `export default [...base, ...overrides]`. */
export const base = tseslint.config(
  { ignores: ['**/dist/**', '**/.output/**', '**/.nuxt/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { projectService: true },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      // `const { dropped: _dropped, ...rest } = value` is the idiomatic way to omit a property.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { ignoreRestSiblings: true, varsIgnorePattern: '^_', argsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      'no-var': 'error',
      'prefer-const': 'error',
      'max-lines': ['warn', { max: 500, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['warn', { max: 35, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ['**/tests/**', '**/*.test.ts', '**/*.spec.ts'],
    rules: { 'max-lines-per-function': 'off' },
  },
  {
    // Tooling files live outside the package tsconfig: lint them untyped.
    files: ['*.config.{js,mjs,ts}', 'eslint.config.*', 'scripts/**/*.{js,ts}'],
    ...tseslint.configs.disableTypeChecked,
  },
  prettier,
);

export default base;
