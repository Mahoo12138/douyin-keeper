export function manualChunks(id: string) {
  if (!id.includes('node_modules')) return undefined
  if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) return 'vendor-react'
  if (id.includes('/@tanstack/react-router/') || id.includes('/@tanstack/router-')) return 'vendor-router'
  if (id.includes('/@tanstack/react-query/')) return 'vendor-query'
  if (id.includes('/lucide-react/')) return 'vendor-icons'
  if (id.includes('/@radix-ui/') || id.includes('/sonner/')) return 'vendor-ui'
  if (id.includes('/react-hook-form/') || id.includes('/@hookform/') || id.includes('/zod/')) return 'vendor-forms'
  return undefined
}
