import { useCallback, useEffect, useState } from 'react'
import { Text, View } from '@tarojs/components'

export type MiniToastTone = 'success' | 'error' | 'warning' | 'info'
export type MiniToastState = { message: string; tone: MiniToastTone }

export function MiniToast({ visible, message, tone = 'info', duration = 2400, onClose }: { visible: boolean; message: string; tone?: MiniToastTone; duration?: number; onClose?: () => void }) {
  useEffect(() => {
    if (!visible || !onClose || duration <= 0) return
    const timer = setTimeout(onClose, duration)
    return () => clearTimeout(timer)
  }, [duration, onClose, visible])

  if (!visible || !message) return null
  return <View className={`mini-toast mini-toast-${tone}`}>
    <View className="mini-toast-icon"><Text>{tone === 'success' ? '✓' : tone === 'error' ? '!' : tone === 'warning' ? '!' : 'i'}</Text></View>
    <Text className="mini-toast-message">{message}</Text>
  </View>
}

export function useMiniToast() {
  const [toast, setToast] = useState<MiniToastState | null>(null)
  const showToast = useCallback((message: string, tone: MiniToastTone = 'info') => setToast({ message, tone }), [])
  const hideToast = useCallback(() => setToast(null), [])
  return { toast, showToast, hideToast }
}
