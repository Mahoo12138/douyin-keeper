import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/api/**', 'node_modules/**'],
  },
  resolve: {
    alias: {
      '@config': resolve(__dirname, './config.ts'),
      '@libs': resolve(__dirname, './libs'),
      '@tests': resolve(__dirname, './tests'),
    },
  },
});
