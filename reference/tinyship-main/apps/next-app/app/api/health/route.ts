import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@libs/database';

/**
 * Health check endpoint for Next.js application
 * Returns application status, database connectivity, and basic system info
 */
export async function GET() {
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
      application: 'next-app',
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
          pid: process.pid
        }
      },
      responseTime: `${totalResponseTime}ms`
    };
    
    // Return appropriate HTTP status code
    const statusCode = healthData.status === 'healthy' ? 200 : 503;
    
    return NextResponse.json(healthData, { 
      status: statusCode,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
    
  } catch (error) {
    console.error('Health check endpoint error:', error);
    
    return NextResponse.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      application: 'next-app',
      error: 'Internal health check error',
      checks: {
        database: { status: 'unknown' },
        system: { status: 'error' }
      }
    }, { 
      status: 503,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  }
}

/**
 * HEAD method support for lightweight health checks
 * Returns only status code without response body
 */
export async function HEAD() {
  try {
    // Quick database connectivity test
    await db.select({ value: sql`1` });
    return new Response(null, { status: 200 });
  } catch (error) {
    console.error('Database connectivity check failed:', error);
    return new Response(null, { status: 503 });
  }
}
