import { sql } from 'drizzle-orm';
import { db } from '@libs/database';

/**
 * HEAD method support for lightweight health checks in Nuxt.js
 * Returns only status code without response body for minimal overhead
 */
export default defineEventHandler(async (event) => {
  try {
    // Quick database connectivity test
    await db.select({ value: sql`1` });
    
    // Set success status
    setResponseStatus(event, 200);
    
    // Return empty response for HEAD method
    return null;
    
  } catch (error) {
    console.error('Database connectivity check failed:', error);
    
    // Set error status
    setResponseStatus(event, 503);
    
    // Return empty response for HEAD method  
    return null;
  }
});
