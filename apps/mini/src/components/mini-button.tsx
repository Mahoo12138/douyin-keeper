import { Button as TaroButton } from '@tarojs/components'
import type { ComponentProps } from 'react'

import { miniButtonDisabledProps } from './mini-button-utils'

type MiniButtonProps = ComponentProps<typeof TaroButton>

/**
 * Taro H5 serializes disabled={false} as a disabled HTML attribute. Keeping
 * the attribute absent for enabled buttons preserves the same semantics on
 * H5 and in the WeChat mini-program runtime.
 */
export function MiniButton({ disabled, ...props }: MiniButtonProps) {
  return <TaroButton {...props} {...miniButtonDisabledProps(disabled)} />
}
