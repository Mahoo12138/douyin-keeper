import { me } from '@douyin-keeper/sdk-ts'
import { requireAuth } from '@/auth/session'

let cachedIdentity: { token: string; role: 'user' | 'admin' } | null = null

export type AdminAccess = 'allowed' | 'forbidden' | 'unauthenticated'
type AdminGuardDeps = {
  authenticate?: typeof requireAuth
  getIdentity?: typeof me
}

export async function resolveAdminAccess(deps: AdminGuardDeps = {}): Promise<AdminAccess> {
  try {
    const token = await (deps.authenticate ?? requireAuth)()
    if (!cachedIdentity || cachedIdentity.token !== token) cachedIdentity = { token, role: (await (deps.getIdentity ?? me)(token)).role }
    return cachedIdentity.role === 'admin' ? 'allowed' : 'forbidden'
  } catch {
    return 'unauthenticated'
  }
}

export async function canActivateAdmin() {
  return (await resolveAdminAccess()) === 'allowed'
}

export function adminRedirectTarget(access: AdminAccess): '/signin' | '/dashboard' | null {
  if (access === 'unauthenticated') return '/signin'
  if (access === 'forbidden') return '/dashboard'
  return null
}

export function clearAdminRole() {
  cachedIdentity = null
}
