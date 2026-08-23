import { join, resolve } from 'path';
import type { NextConfig } from 'next'

import { config } from 'dotenv';

// Load .env file from root directory
// Note: __dirname is automatically provided by Next.js 16
config({ path: join(__dirname, '../../.env') });

// Resolve project root directory and libs directory absolute paths
const rootDir = resolve(__dirname || process.cwd(), '../..');
const libsDir = resolve(rootDir, 'libs');

// Resolve SQLITE_DB_PATH to absolute — relative paths are resolved against monorepo root
const sqliteDbPath = resolve(rootDir, process.env.SQLITE_DB_PATH || './data/local.sqlite');

/** @type {import('next').NextConfig} */
const nextConfig: NextConfig= {
  webpack(config: any) {
    // Modify webpack configuration to handle SVG files
    config.module.rules.push({
      test: /\.svg$/i,
      issuer: { and: [/\.(js|ts|md)x?$/] },
      use: [{
        loader: '@svgr/webpack',
      }],
    });

    // Add resolve paths for external folders
    config.resolve.alias = {
      ...config.resolve.alias,
      '@libs': libsDir
    };

    return config;
  },
  // Allow loading images from external directories
  images: {
    dangerouslyAllowSVG: true,
    domains: [],
  },
  // https://github.com/vercel/next.js/issues/50042
  // ali-oss uses urllib which requires proxy-agent (Node.js only)
  serverExternalPackages: ['mjml', 'handlebars', 'ali-oss', 'urllib', 'better-sqlite3'],
  env: {
    SQLITE_DB_PATH: sqliteDbPath,
    NEXT_PUBLIC_AFFILIATE_ENABLED: process.env.AFFILIATE_ENABLED || 'false',
  },
  // Enable standalone mode for Docker deployment
  output: 'standalone',
  experimental: {
    // Allow importing from external directories
    externalDir: true,
  },
  turbopack: {
    rules: {
      '*.svg': {
        loaders: ['@svgr/webpack'],
        as: '*.js',
      },
    },
  },
};

export default nextConfig;
