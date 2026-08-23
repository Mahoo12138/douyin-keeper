# Next.js Production Dockerfile
# Use Node.js 22 LTS (22.20+ recommended for best compatibility)
FROM node:22-alpine AS base

# Build stage - install deps and build
FROM base AS builder
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.4.0 --activate

# Copy all files needed for build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json config.ts tsconfig.json .npmrc ./
COPY config ./config
COPY apps/next-app ./apps/next-app
COPY libs ./libs
COPY scripts ./scripts
# Copy sibling app package.json files for pnpm workspace resolution
COPY apps/nuxt-app/package.json ./apps/nuxt-app/package.json
COPY apps/tanstack-app/package.json ./apps/tanstack-app/package.json

# Accept build arguments for CI/CD environments
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ARG NEXT_PUBLIC_WECHAT_APP_ID
# Allow overriding Node.js memory limit for build (default: 4GB, suitable for CI and most machines)
# For local builds with more memory, use: --build-arg NODE_OPTIONS="--max-old-space-size=8192"
ARG NODE_OPTIONS="--max-old-space-size=4096"

# Copy .env file if it exists (for local builds)
COPY .env* ./

# Set build-time environment variables
# Priority: build args > .env file > fallback defaults
ENV BUILD_TIME=true
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=${NEXT_PUBLIC_TURNSTILE_SITE_KEY}
ENV NEXT_PUBLIC_WECHAT_APP_ID=${NEXT_PUBLIC_WECHAT_APP_ID}
# Set Node.js memory limit for build process (can be overridden via build arg)
ENV NODE_OPTIONS=${NODE_OPTIONS}

# Install dependencies
RUN pnpm install --frozen-lockfile
# Build the application
RUN pnpm build:next

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

# Don't run production as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built application
COPY --from=builder /app/apps/next-app/.next/standalone ./
COPY --from=builder /app/apps/next-app/.next/static ./apps/next-app/.next/static
COPY --from=builder /app/apps/next-app/public ./apps/next-app/public

# SQLite support: create data directory for DB_DIALECT=sqlite
RUN mkdir -p /app/data

# Set correct permissions
RUN chown -R nextjs:nodejs /app
USER nextjs

EXPOSE 7001

ENV PORT=7001
ENV NODE_ENV=production
ENV HOSTNAME="0.0.0.0"

# Start the application
CMD ["node", "apps/next-app/server.js"] 