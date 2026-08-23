import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/api/**/*.test.ts'],
    testTimeout: 15_000,
  },
  resolve: {
    alias: {
      '@libs': resolve(__dirname, './libs'),
      '@tests': resolve(__dirname, './tests'),
    },
  },
});
