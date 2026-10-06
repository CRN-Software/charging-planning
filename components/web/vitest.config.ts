import { defineVitestConfig } from '@nuxt/test-utils/config';

export default defineVitestConfig({
  test: {
    environment: 'nuxt',
    passWithNoTests: true,
    include: ['app/**/*.test.ts'],
    coverage: { provider: 'v8', reporter: ['text', 'lcov'], include: ['app/**'] },
  },
});
