import { useEffect } from 'react'

export function isMobileNavDismissKey(key: string) {
  return key === 'Escape'
}

export function useMobileNavDismissed(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return

    function closeOnEscape(event: KeyboardEvent) {
      if (isMobileNavDismissKey(event.key)) onClose()
    }

    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose, open])
}
