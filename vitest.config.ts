import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    globalSetup: ['./scripts/vitest-global-setup.mjs'],
    testTimeout: 30000,
    include: ['tests/**/*.test.ts'],
    coverage: {
      include: ['src/server/slots.ts'],
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
