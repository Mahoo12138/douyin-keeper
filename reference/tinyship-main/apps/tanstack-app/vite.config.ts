import { config as dotenvConfig } from 'dotenv'
import path from 'node:path'

dotenvConfig({ path: path.resolve(__dirname, '../../.env') })

// Resolve SQLITE_DB_PATH to absolute — relative paths are resolved against monorepo root
const rootDir = path.resolve(__dirname, '../..')
process.env.SQLITE_DB_PATH = path.resolve(rootDir, process.env.SQLITE_DB_PATH || './data/local.sqlite')

import { defineConfig, type PluginOption } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import svgr from 'vite-plugin-svgr'

const isCfDeploy = !!process.env.CF_DEPLOY

async function getCfPlugin(): Promise<PluginOption[]> {
  if (!isCfDeploy) return []
  const { cloudflare } = await import('@cloudflare/vite-plugin')
  return [cloudflare({ viteEnvironment: { name: 'ssr' } })]
}

async function getNitroPlugin(): Promise<PluginOption[]> {
  if (isCfDeploy) return []
  const { nitro } = await import('nitro/vite')
  return [nitro({
    rollupConfig: {
      external: [/^cloudflare:/],
    },
  })]
}

const cfPlugin = await getCfPlugin()
const nitroPlugin = await getNitroPlugin()

export default defineConfig({
  // Shared VITE_* client variables live in the monorepo root .env file.
  envDir: rootDir,
  // Wrangler vars are server-side runtime values. The client bundle needs an
  // explicit build-time value so the CF upload UI defaults to native R2.
  define: isCfDeploy
    ? {
        'import.meta.env.VITE_STORAGE_PROVIDER': JSON.stringify(
          process.env.VITE_STORAGE_PROVIDER || 'r2',
        ),
      }
    : undefined,
  server: {
    port: 7001,
    // Allow the Cloudflare Tunnel hostname used for local payment webhooks.
    // Keep this explicit instead of allowing arbitrary Host headers.
    allowedHosts: ['test.vikingship.uk'],
  },
  plugins: [
    ...cfPlugin,
    ...nitroPlugin,
    tailwindcss(),
    tsconfigPaths(),
    svgr({ svgrOptions: { icon: true }, include: '**/*.svg' }),
    tanstackStart(),
    viteReact(),
  ],
  build: isCfDeploy
    ? undefined
    : {
        rollupOptions: {
          external: [/^cloudflare:/],
        },
      },
  environments: isCfDeploy
    ? {
        ssr: {
          optimizeDeps: {
            include: [
              'react',
              'react-dom',
              'react-dom/server',
              'react/jsx-runtime',
              'react/jsx-dev-runtime',
              'sonner',
              'drizzle-orm',
              'drizzle-orm/node-postgres',
              'drizzle-orm/better-sqlite3',
              'drizzle-orm/d1',
              'drizzle-orm/pg-core',
              'drizzle-orm/sqlite-core',
              'better-sqlite3',
              'pg',
              'nanoid',
              'stripe',
              'zod',
            ],
          },
        },
      }
    : undefined,
  ssr: {
    noExternal: ['streamdown', 'katex', 'rehype-katex'],
  },
})
