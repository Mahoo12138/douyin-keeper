import { sql } from 'drizzle-orm';
import { db } from '@libs/database';

/**
 * Health check endpoint for Nuxt.js application
 * Returns application status, database connectivity, and basic system info
 */
export default defineEventHandler(async (event) => {
  try {
    const startTime = Date.now();
    
    // Check database connectivity
    let dbStatus = 'healthy';
    let dbResponseTime = 0;
    
    try {
      const dbStartTime = Date.now();
      // Simple database connectivity test
      await db.select({ value: sql`1` });
      dbResponseTime = Date.now() - dbStartTime;
    } catch (error) {
      dbStatus = 'unhealthy';
      console.error('Database health check failed:', error);
    }
    
    const totalResponseTime = Date.now() - startTime;
    
    const healthData = {
      status: dbStatus === 'healthy' ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      application: 'nuxt-app',
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      checks: {
        database: {
          status: dbStatus,
          responseTime: `${dbResponseTime}ms`
        },
        memory: {
          used: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
          total: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`
        },
        system: {
          platform: process.platform,
          nodeVersion: process.version,
          pid: process.pid,
          nuxtVersion: '3.x' // Nuxt specific information
        }
      },
      responseTime: `${totalResponseTime}ms`
    };
    
    // Set appropriate HTTP status code
    if (healthData.status !== 'healthy') {
      setResponseStatus(event, 503);
    }
    
    // Set cache control headers to prevent caching
    setResponseHeaders(event, {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Content-Type': 'application/json'
    });
    
    return healthData;
    
  } catch (error) {
    console.error('Health check endpoint error:', error);
    
    // Set error status
    setResponseStatus(event, 503);
    setResponseHeaders(event, {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache', 
      'Expires': '0',
      'Content-Type': 'application/json'
    });
    
    return {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      application: 'nuxt-app',
      error: 'Internal health check error',
      checks: {
        database: { status: 'unknown' },
        system: { status: 'error' }
      }
    };
  }
});
