import { me } from '@douyin-keeper/sdk-ts'
import { requireAuth } from '@/auth/session'

let cachedIdentity: { token: string; role: 'user' | 'admin' } | null = null

export async function canActivateAdmin() {
  try {
    const token = await requireAuth()
    if (!cachedIdentity || cachedIdentity.token !== token) cachedIdentity = { token, role: (await me(token)).role }
    return cachedIdentity.role === 'admin'
  } catch {
    return false
  }
}

export function clearAdminRole() {
  cachedIdentity = null
}
