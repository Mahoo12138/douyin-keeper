import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'

// SPA for the Go backend: /api is proxied in dev; production builds emit
// dist/ which the Go binary serves via go:embed (docs/16 §2).
export default defineConfig({
  plugins: [
    TanStackRouterVite(),
    react(),
    tailwindcss(),
    // Scoped to this app: scanning the whole workspace picks up the vendored
    // reference/ tsconfigs (e.g. nuxt-app's generated .nuxt extends) and fails.
    tsconfigPaths({ projects: ['tsconfig.json'], ignoreConfigErrors: true }),
  ],
  server: {
    // Keep local development reachable at the documented IPv4 loopback URL
    // (127.0.0.1:5173); Vite otherwise binds only ::1 on some macOS setups.
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8080', changeOrigin: true },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
  build: {
    outDir: 'dist',
  },
})
