// https://nuxt.com/docs/api/configuration/nuxt-config
import { resolve } from 'path';
import { loadEnv } from 'vite';
import tailwindcss from "@tailwindcss/vite";
import svgLoader from 'vite-svg-loader';

// Load environment variables using Vite's loadEnv
const env = loadEnv(process.env.NODE_ENV || 'development', resolve(__dirname, '../..'), '');
// Merge environment variables into process.env
Object.assign(process.env, env);

// Resolve SQLITE_DB_PATH to absolute — relative paths are resolved against monorepo root
const rootDir = resolve(__dirname, '../..');
process.env.SQLITE_DB_PATH = resolve(rootDir, process.env.SQLITE_DB_PATH || './data/local.sqlite');

import { config as appConfig } from '../../config';

export default defineNuxtConfig({
  compatibilityDate: '2025-05-15',
  devtools: { enabled: true },
  
  // TypeScript configuration
  typescript: {
    // Enable type checking during local build only
    // Disable in Docker (BUILD_TIME=true) because:
    // 1. Local build already validates types
    // 2. Docker's pnpm strict mode can't resolve transitive dependency types (vue-i18n, vite)
    // See: https://nuxt.com/docs/api/nuxt-config#typecheck
    typeCheck: process.env.BUILD_TIME ? false : 'build',
    tsConfig: {
      compilerOptions: {
        // Disable verbatimModuleSyntax for better compatibility with shared libs
        // Nuxt enables this by default, but libs use mixed import styles
        verbatimModuleSyntax: false,
        // Disable noUncheckedIndexedAccess to match root tsconfig
        // Nuxt enables this by default, causing array[0] to be T | undefined
        noUncheckedIndexedAccess: false
      }
    }
  },
  devServer: {
    port: 7001,
  },
  css: ['~/assets/css/main.css'],

  vite: {
    // Fix HMR issues with file watching
    server: {
      // host: '0.0.0.0',
      hmr: {
          protocol: 'ws',
          host: 'localhost'
      },
     /* client: {
          webSocketURL: 'ws://0.0.0.0:8080/ws',
      },*/
      watch: {
          usePolling: true,
          interval: 1000,
      },
      allowedHosts: [
        'test.vikingship.uk'
      ]
    },
    // External Next.js modules to avoid build conflicts
    build: {
      rollupOptions: {
        external: ['next/headers', 'next/server', 'next/navigation']
      }
    },
    // Enable JSX support for Vue
    esbuild: {
      jsx: 'preserve',
      jsxFactory: 'h',
      jsxFragment: 'Fragment'
    },
    plugins: [
      tailwindcss(),
      svgLoader({
        defaultImport: 'component', // Default import as Vue component
        svgoConfig: {
          plugins: [
            {
              name: 'preset-default',
              params: {
                overrides: {
                  removeViewBox: false, // Keep viewBox attribute
                },
              },
            },
          ],
        },
      }),
    ],
    optimizeDeps: {
      include: ['pg', 'drizzle-orm']
    }
  },

  // Configure Nitro to support CommonJS modules and improve HMR
  nitro: {
    experimental: {
      wasm: true
    },
    commonJS: {
      include: [
        /pg/,
        /drizzle-orm/
      ]
    },
    // Inline zod to avoid Nitro's incomplete bundling of zod v4.x
    // See: https://github.com/unjs/nitro/issues - zod v4 has a complex export structure
    // that Nitro doesn't fully copy to .output/server/node_modules
    externals: {
      inline: ['zod']
    },
    // Development specific settings
    dev: process.env.NODE_ENV === 'development'
  },

  // Configure environment variables using centralized config
  runtimeConfig: {
    // Server-side environment variables
    databaseUrl: appConfig.database.url,
    betterAuthSecret: process.env.BETTER_AUTH_SECRET,
    // AI configuration is handled by @libs/ai directly from environment variables
    
    // Public environment variables (accessible on client)
    public: {
      // Affiliate visibility only. Server routes still enforce AFFILIATE_ENABLED
      // through the shared configuration.
      affiliateEnabled: process.env.AFFILIATE_ENABLED === 'true',
      // Captcha configuration
      captchaEnabled: String(appConfig.captcha.enabled),
      turnstileSiteKey: appConfig.captcha.cloudflare.siteKey || '0x4AAAAAAABkMYinukNdH9ly', // Default development key
      // WeChat configuration
      wechatAppId: appConfig.auth.socialProviders.wechat.appId || 'wx_default_dev_key', // Safe default for development
      // Payment configuration
      paymentPlans: JSON.parse(JSON.stringify(appConfig.payment.plans)),
      pricingMode: appConfig.payment.pricingMode || 'static'
    }
  },

  // Configure path aliases
  alias: {
    "@": resolve(__dirname, '.'),
    "@libs": resolve(__dirname, '../../libs'),
    "@config": resolve(__dirname, '../../config.ts'),
  },

  // Configure build options to support CommonJS
  build: {
    transpile: ['pg', 'drizzle-orm']
  },

  modules: ['shadcn-nuxt', '@pinia/nuxt', '@nuxtjs/i18n', 'nuxt-charts', 'motion-v/nuxt'],
  
  // Configure components auto-import
  // Only scan .vue files to avoid conflicts with .ts/.tsx files (like columns.ts, index.ts)
  components: {
    dirs: [
      {
        path: '~/components',
        pathPrefix: false,
        extensions: ['.vue'],
      },
      {
        path: '~/components/admin',
        pathPrefix: false,
        extensions: ['.vue'],
      },
      {
        path: '~/components/admin/users',
        pathPrefix: false,
        extensions: ['.vue'],
      }
    ]
  },
  
  // Theme configuration is now handled by our custom useTheme composable
  // and theme.client.ts plugin
  
  // Internationalization configuration
  i18n: {
    locales: appConfig.app.i18n.locales.map(code => ({
      code,
      name: code === 'en' ? 'English' : '中文',
    })),
    defaultLocale: appConfig.app.i18n.defaultLocale,
    strategy: 'prefix',
    detectBrowserLanguage: appConfig.app.i18n.autoDetect ? {
      useCookie: true,
      cookieKey: appConfig.app.i18n.cookieKey,
      redirectOn: 'root',
      alwaysRedirect: true,
      fallbackLocale: appConfig.app.i18n.defaultLocale,
    } : false, // Disable browser detection if autoDetect is false
  },

  shadcn: {
    /**
     * Prefix for all the imported component
     */
    prefix: '',
    /**
     * Directory that the component lives in.
     * Fix: Use ~ to correctly resolve to app folder
     * See: https://github.com/unovue/shadcn-vue/issues/1416
     */
    componentDir: '~/components/ui'
  },

  // App configuration including favicon and metadata
  app: {
    head: {
      link: [
        // Favicon configuration - matching Next.js app
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
        { rel: 'icon', type: 'image/png', sizes: '192x192', href: '/android-chrome-192x192.png' },
        { rel: 'icon', type: 'image/png', sizes: '512x512', href: '/android-chrome-512x512.png' },
        { rel: 'mask-icon', href: '/logo.svg', color: '#3b82f6' },
        { rel: 'manifest', href: '/site.webmanifest' }
      ],
      meta: [
        { name: 'theme-color', content: '#3b82f6' },
        { name: 'msapplication-TileColor', content: '#3b82f6' },
        { name: 'msapplication-config', content: 'none' }
      ]
    }
  }

})
