// Lightweight ambient declarations for Taro page configuration and build-time
// environment variables used by the mini runtime.
declare function defineAppConfig(config: Record<string, unknown>): Record<string, unknown>
declare function definePageConfig(config: Record<string, unknown>): Record<string, unknown>
declare const process: { env: Record<string, string | undefined> }
declare module '*.css'
