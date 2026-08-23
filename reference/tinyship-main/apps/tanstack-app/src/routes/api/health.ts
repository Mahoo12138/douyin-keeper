import { createFileRoute } from '@tanstack/react-router'
import { sql } from 'drizzle-orm'
import { withCfDb } from '@/lib/with-request-db'

async function checkDatabase() {
  const { db } = await import('@libs/database')
  await db.select({ value: sql`1` })
}

function createHealthResponse(status: 'healthy' | 'unhealthy', dbResponseTime: number, startTime: number) {
  return {
    status,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    application: 'tanstack-app',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    checks: {
      database: {
        status,
        responseTime: `${dbResponseTime}ms`,
      },
      memory: {
        used: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
        total: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`,
      },
      system: {
        platform: process.platform,
        nodeVersion: process.version,
        pid: process.pid,
      },
    },
    responseTime: `${Date.now() - startTime}ms`,
  }
}

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: withCfDb(async () => {
        const startTime = Date.now()
        let dbStatus: 'healthy' | 'unhealthy' = 'healthy'
        let dbResponseTime = 0

        try {
          const dbStartTime = Date.now()
          await checkDatabase()
          dbResponseTime = Date.now() - dbStartTime
        } catch (error) {
          dbStatus = 'unhealthy'
          console.error('Database health check failed:', error)
        }

        const healthData = createHealthResponse(dbStatus, dbResponseTime, startTime)

        return Response.json(healthData, {
          status: healthData.status === 'healthy' ? 200 : 503,
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
          },
        })
      }),
      HEAD: withCfDb(async () => {
        try {
          await checkDatabase()
          return new Response(null, { status: 200 })
        } catch (error) {
          console.error('Database connectivity check failed:', error)
          return new Response(null, { status: 503 })
        }
      }),
    },
  },
})
