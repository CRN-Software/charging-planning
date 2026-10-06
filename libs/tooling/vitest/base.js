import { defineConfig } from 'vitest/config';

export const base = defineConfig({
  test: {
    globals: false,
    passWithNoTests: true,
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**'],
    },
  },
});

/** Shallow-merges `test` so package overrides (e.g. `include`) replace instead of concatenating. */
export const withBase = (overrides = {}) =>
  defineConfig({ ...base, ...overrides, test: { ...base.test, ...overrides.test } });

export default base;
