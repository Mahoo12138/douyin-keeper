import type { AppUser } from '@libs/permissions'

/**
 * Verify that the request comes from an authenticated admin user.
 * Returns the session user on success, or a 401/403 Response on failure.
 */
export async function requireAdminAPI(
  request: Request,
): Promise<{ user: AppUser } | Response> {
  const { auth } = await import('@libs/auth')
  const { can, Action, Subject, Role } = await import('@libs/permissions')

  const session = await auth.api.getSession({
    headers: new Headers(request.headers),
  })

  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const appUser = {
    ...session.user,
    role:
      (session.user.role as (typeof Role)[keyof typeof Role]) || Role.NORMAL,
  } as AppUser

  if (!can(appUser, Action.MANAGE, Subject.ALL)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  return { user: appUser }
}
