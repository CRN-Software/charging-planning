import swc from 'unplugin-swc';
import tsconfigPaths from 'vite-tsconfig-paths';
import { withBase } from '@charging/tooling/vitest';

// SWC keeps decorator metadata (Nest DI) — esbuild would drop it.
export default withBase({
  plugins: [tsconfigPaths(), swc.vite({ module: { type: 'nodenext' } })],
  test: {
    include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
  },
});
