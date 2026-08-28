import type { PropsWithChildren, ReactNode } from 'react'
import { Text, View } from '@tarojs/components'

import { MiniButton } from './mini-button'

export type MiniNavbarProps = PropsWithChildren<{
  title: string
  subtitle?: string
  showBack?: boolean
  onBack?: () => void
  right?: ReactNode
  className?: string
}>

/**
 * Cross-platform page navigation header. Keep the right slot present so the
 * title stays optically centered when a page only has a back action.
 */
export function MiniNavbar({ title, subtitle, showBack = false, onBack, right, className = '', children }: MiniNavbarProps) {
  return <View className={`mini-navbar ${className}`.trim()}>
    {showBack ? <MiniButton className="mini-navbar-back" onClick={onBack}>‹</MiniButton> : <View className="mini-navbar-leading" />}
    <View className="mini-navbar-copy">
      <Text className="mini-navbar-title">{title}</Text>
      {subtitle && <Text className="mini-navbar-subtitle">{subtitle}</Text>}
    </View>
    <View className="mini-navbar-trailing">{right ?? children ?? <View className="mini-navbar-spacer" />}</View>
  </View>
}
