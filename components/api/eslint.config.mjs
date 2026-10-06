import { base } from '@charging/tooling/eslint';

export default [
  ...base,
  {
    files: ['src/**/*.ts'],
    rules: {
      // Nest DI relies on class-based patterns
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
];
