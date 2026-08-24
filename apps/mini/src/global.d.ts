// Lightweight ambient declarations so tsc has no runtime-free type errors
// until the full Taro CLI type chain is installed.
declare function defineAppConfig(config: Record<string, unknown>): Record<string, unknown>
declare function definePageConfig(config: Record<string, unknown>): Record<string, unknown>
declare const process: { env: Record<string, string | undefined> }
declare module '*.css'
