import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function isOverlayDismissKey(key: string) {
  return key === 'Escape'
}

export function useOverlayBehavior<T extends HTMLElement = HTMLElement>(open: boolean, onClose: () => void) {
  const overlayRef = useRef<T>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusFirst = () => overlayRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus()
    const frame = window.requestAnimationFrame(focusFirst)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function handleKeyDown(event: KeyboardEvent) {
      const overlay = overlayRef.current
      if (!overlay) return

      if (isOverlayDismissKey(event.key)) {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = Array.from(overlay.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      if (!focusable.length) {
        event.preventDefault()
        overlay.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const targetInside = !(event.target instanceof Node) || overlay.contains(event.target)
      if (!targetInside) {
        event.preventDefault()
        const target = event.shiftKey ? last : first
        target.focus()
        return
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [open])

  return overlayRef
}
