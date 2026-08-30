import type { PropsWithChildren, ReactNode } from 'react'
import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'

import { MiniButton } from './mini-button'
import { resolveMiniNavbarMetrics } from './mini-navbar-utils'

function readMiniNavbarMetrics() {
  try {
    const windowInfo = Taro.getWindowInfo()
    const menuButton = Taro.getMenuButtonBoundingClientRect()
    return resolveMiniNavbarMetrics(windowInfo.windowWidth, windowInfo.statusBarHeight ?? 0, menuButton)
  } catch {
    return resolveMiniNavbarMetrics(375, 0)
  }
}

export type MiniNavbarProps = {
  title: ReactNode
  subtitle?: ReactNode
  leading?: ReactNode
  action?: ReactNode
  showBack?: boolean
  onBack?: () => void
  align?: 'start' | 'center'
  className?: string
}

export function MiniNavbar({ title, subtitle, leading, action, showBack = false, onBack, align = 'center', className = '' }: MiniNavbarProps) {
  const metrics = readMiniNavbarMetrics()
  const handleBack = onBack ?? (() => { void Taro.navigateBack() })
  const leadingSlot = leading ?? (showBack
    ? <MiniNavbarAction className="mini-navbar-back" ariaLabel="返回" onClick={handleBack}><Text>‹</Text></MiniNavbarAction>
    : null)

  return <View
    className={`mini-navbar mini-navbar-${align} ${className}`.trim()}
    style={{ paddingTop: `${metrics.statusBarHeight}px`, paddingRight: `${metrics.capsuleInset}px` }}
  >
    <View className="mini-navbar-row" style={{ height: `${metrics.rowHeight}px` }}>
      <View className="mini-navbar-leading">{leadingSlot}</View>
      <View className="mini-navbar-copy">
        {typeof title === 'string' ? <Text className="mini-navbar-title">{title}</Text> : title}
        {subtitle ? (typeof subtitle === 'string' ? <Text className="mini-navbar-subtitle">{subtitle}</Text> : subtitle) : null}
      </View>
      <View className="mini-navbar-actions">{action}</View>
    </View>
  </View>
}

export type MiniNavbarActionProps = PropsWithChildren<{
  onClick?: () => void
  disabled?: boolean
  className?: string
  ariaLabel?: string
}>

export function MiniNavbarAction({ onClick, disabled, className = '', ariaLabel, children }: MiniNavbarActionProps) {
  return <MiniButton
    className={`mini-navbar-action ${className}`.trim()}
    disabled={disabled}
    aria-label={ariaLabel}
    onClick={onClick}
  >
    {children}
  </MiniButton>
}

export type MiniPageLayoutProps = PropsWithChildren<MiniNavbarProps & {
  pageClassName?: string
}>

export function MiniPageLayout({ pageClassName = '', children, ...navbarProps }: MiniPageLayoutProps) {
  return <View className={`mini-page ${pageClassName}`.trim()}>
    <MiniNavbar {...navbarProps} />
    {children}
  </View>
}
