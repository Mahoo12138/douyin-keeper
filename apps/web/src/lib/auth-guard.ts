import { requireAuth } from '@/auth/session'

/**
 * Active-session guard used by the protected layout's beforeLoad
 * (docs/13 §7). Attempts a cookie refresh on first load and returns whether a
 * usable token exists.
 */
export async function canActivate(): Promise<boolean> {
  try {
    return (await requireAuth()) !== null
  } catch {
    return false
  }
}