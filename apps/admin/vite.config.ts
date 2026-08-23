import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'

export default defineConfig({
  plugins: [
    TanStackRouterVite(),
    react(),
    tailwindcss(),
    // Scoped to this app: the vendored reference/ tsconfigs break workspace
    // scanning (nuxt-app extends a generated .nuxt config).
    tsconfigPaths({ projects: ['tsconfig.json'], ignoreConfigErrors: true }),
  ],
  server: {
    port: 5174,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8080', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
  },
})