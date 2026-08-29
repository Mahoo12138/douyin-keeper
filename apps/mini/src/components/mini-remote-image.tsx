import { Image, type ImageProps } from '@tarojs/components'

import { miniAssetUrl } from '@/lib/mini-assets'

type MiniRemoteImageProps = Omit<ImageProps, 'src'> & { name?: string; src?: string }

export function MiniRemoteImage({ name, src, ...props }: MiniRemoteImageProps) {
  const imageSrc = src && /^(?:https?:|data:|blob:|\/)/.test(src) ? src : src ? miniAssetUrl(src) : miniAssetUrl(name || '')
  return <Image {...props} src={imageSrc} />
}
