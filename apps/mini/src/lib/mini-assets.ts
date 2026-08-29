export function resolveMiniAssetUrl(baseUrl: string, assetName: string) {
  const normalizedName = assetName.replace(/^\/+/, '')
  const normalizedBase = baseUrl.replace(/\/+$/, '')
  return normalizedBase ? `${normalizedBase}/${normalizedName}` : `/${normalizedName}`
}

export function miniAssetUrl(assetName: string) {
  return resolveMiniAssetUrl(process.env.TARO_APP_ASSET_BASE_URL || '', assetName)
}
