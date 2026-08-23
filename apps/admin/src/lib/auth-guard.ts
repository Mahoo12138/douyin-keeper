import { requireAuth } from '@/auth/session'

export type MeInfo = { id: string; display_name: string; role: 'user' | 'admin' }

let cachedMe: MeInfo | null = null

/**
 * Admin console guard: active session + role=admin (docs/13 §6). Admin uses
 * the same Account system; the console is a separate SPA with its own gate.
 */
export async function adminActivate(): Promise<{ role: 'user' | 'admin' } | null> {
  try {
    const token = await requireAuth()
    if (!cachedMe) {
      const resp = await fetch('/api/v1/me', { headers: { Authorization: `Bearer ${token}` } })
      if (!resp.ok) return null
      cachedMe = (await resp.json()) as MeInfo
    }
    return cachedMe.role === 'admin' ? { role: 'admin' } : null
  } catch {
    return null
  }
}