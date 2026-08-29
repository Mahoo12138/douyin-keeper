type MiniApiEnvironment = Record<string, string | undefined>

export function resolveApiBaseUrl(runtime: string | undefined, environment: MiniApiEnvironment) {
  const configured = runtime === 'h5'
    ? environment.TARO_APP_H5_API_BASE_URL
    : environment.TARO_APP_API_BASE_URL

  return (configured || '/api/v1').replace(/\/$/, '')
}
