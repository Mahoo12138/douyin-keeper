/**
 * Configuration utility functions
 */

/**
 * Get environment variable value
 */
export function getEnv(key: string): string | undefined {
  return process.env[key];
}

/**
 * Warning function for missing environment variables
 */
export function warnMissingEnv(key: string, service: string): void {
  console.warn(`Warning: Missing environment variable ${key} for ${service} service. This service will not be available.`);
}

/**
 * Get environment variables for optional services (warns if missing)
 */
export function getEnvForService(key: string, service: string): string | undefined {
  const value = getEnv(key);
  if (!value) {
    warnMissingEnv(key, service);
  }
  return value;
}

/**
 * Get environment variables for required services with development defaults
 */
export function requireEnvForService(key: string, service: string, devDefault?: string): string {
  const value = getEnv(key);
  if (!value) {
    // In development, use default values if provided
    if (process.env.NODE_ENV === 'development' && devDefault) {
      console.warn(`Warning: Using default value for ${key} in development. Set ${key} in .env file for production.`);
      return devDefault;
    }
    // During build time, return a placeholder to avoid build failures
    if (process.env.BUILD_TIME === 'true') {
      console.warn(`Warning: Missing ${key} for ${service} service during build. This will be validated at runtime.`);
      return `__BUILD_TIME_PLACEHOLDER_${key}__`;
    }
    throw new Error(`Missing required environment variable: ${key} for ${service} service. This service is required for the application to function.`);
  }
  return value;
}

/**
 * Get environment variables with fallback keys (tries keys in order)
 */
export function requireEnvWithFallback(keys: string[], service: string): string {
  for (const key of keys) {
    const value = getEnv(key);
    if (value) return value;
  }
  // During build time, return a placeholder to avoid build failures
  if (process.env.BUILD_TIME === 'true') {
    console.warn(`Warning: Missing ${keys.join(' or ')} for ${service} service during build. This will be validated at runtime.`);
    return `__BUILD_TIME_PLACEHOLDER_${keys[0]}__`;
  }
  throw new Error(`Missing ${keys.join(' or ')} for ${service}`);
}
