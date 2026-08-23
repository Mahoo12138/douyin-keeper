/**
 * Unified Authentication Middleware for Nuxt.js
 * Handles all authentication, authorization, and subscription checks in one place
 */
import { authClientVue } from '@libs/auth/authClient'
import { Action, Subject, can, createAppUser } from '@libs/permissions'
import { locales } from '@libs/i18n'


// Route configuration interface
interface ProtectedRouteConfig {
  pattern: RegExp
  type: 'page' | 'api'
  // Authentication requirements
  requiresAuth?: boolean // Explicit authentication requirement
  // Permission required for access
  requiredPermission?: { 
    action: Action
    subject: Subject
  }
  // Subscription requirements
  requiresSubscription?: boolean
  // Auth route that should redirect logged-in users
  isAuthRoute?: boolean
  // Redirect subscribed users (e.g., pricing page)
  redirectIfSubscribed?: boolean
}

// Unified protected routes configuration - using Next.js style for consistency
const protectedRoutes: ProtectedRouteConfig[] = [
  // Auth routes - redirect logged-in users to dashboard
  {
    pattern: new RegExp(`^\\/(${locales.join('|')})\\/signin$`),
    type: 'page',
    requiresAuth: false,
    isAuthRoute: true
  },
  {
    pattern: new RegExp(`^\\/(${locales.join('|')})\\/signup$`),
    type: 'page',
    requiresAuth: false,
    isAuthRoute: true
  },
  {
    pattern: new RegExp(`^\\/(${locales.join('|')})\\/forgot-password$`),
    type: 'page',
    requiresAuth: false,
    isAuthRoute: true
  },
  {
    pattern: new RegExp(`^\\/(${locales.join('|')})\\/reset-password$`),
    type: 'page',
    requiresAuth: false,
    isAuthRoute: true
  },
  {
    pattern: new RegExp(`^\\/(${locales.join('|')})\\/cellphone$`),
    type: 'page',
    requiresAuth: false,
    isAuthRoute: true
  },
  {
    pattern: new RegExp(`^\\/(${locales.join('|')})\\/wechat$`),
    type: 'page',
    requiresAuth: false,
    isAuthRoute: true
  },
  
  // Admin routes - require admin permissions (require locale prefix)
  {
    pattern: new RegExp(`^\\/(${locales.join('|')})\\/admin(\\/.*)?$`),
    type: 'page',
    requiresAuth: true,
    requiredPermission: { action: Action.MANAGE, subject: Subject.ALL }
  },
  
  // Settings pages - require authentication only (require locale prefix)
  {
    pattern: new RegExp(`^\\/(${locales.join('|')})\\/settings(\\/.*)?$`),
    type: 'page',
    requiresAuth: true
  },
  
  // Dashboard - require authentication only (require locale prefix)
  {
    pattern: new RegExp(`^\\/(${locales.join('|')})\\/dashboard(\\/.*)?$`),
    type: 'page',
    requiresAuth: true
  },
  
  // Premium features - require active subscription (require locale prefix)
  {
    pattern: new RegExp(`^\\/(${locales.join('|')})\\/premium-features(\\/.*)?$`),
    type: 'page',
    requiresAuth: true,
    requiresSubscription: true
  },
  
  // Upload page - require authentication only
  {
    pattern: new RegExp(`^\\/(${locales.join('|')})\\/upload$`),
    type: 'page',
    requiresAuth: true
  },
  
  // Pricing page - accessible to all users
  // Note: Removed redirectIfSubscribed because users with subscriptions
  // may still want to purchase credits
  // {
  //   pattern: new RegExp(`^\\/(${locales.join('|')})\\/pricing$`),
  //   type: 'page',
  //   requiresAuth: false,
  // },
  
  // AI features - require authentication (require locale prefix)
  // {
  //   pattern: new RegExp(`^\\/(${locales.join('|')})\\/ai(\\/.*)?$`),
  //   type: 'page',
  //   requiresAuth: true
  // },
  
  // Payment pages - require authentication (require locale prefix)
  {
    pattern: new RegExp(`^\\/(${locales.join('|')})\\/payment-success$`),
    type: 'page',
    requiresAuth: true
  },
  {
    pattern: new RegExp(`^\\/(${locales.join('|')})\\/payment-cancel$`),
    type: 'page',
    requiresAuth: true
  }
]

/**
 * Check if user has valid subscription via API call
 */
async function hasValidSubscription(userId: string): Promise<boolean> {
  try {
    // 通过 API 调用检查订阅状态，避免在客户端导入数据库模块
    const response = await $fetch('/api/subscription/status', {
      method: 'GET'
    })
    
    return response && response.hasSubscription
  } catch (error) {
    console.error('Failed to check subscription status:', error)
    return false
  }
}

/**
 * Get user session using Better Auth
 */
async function getUserSession() {
  try {
    // Since we already waited for auth to be ready in the middleware,
    // we can directly get the session
    const session = await authClientVue.getSession()
    
    return {
      session,
      user: session?.data?.user,
      isAuthenticated: !!session?.data?.user
    }
  } catch (error) {
    console.error('Failed to get session:', error)
    return {
      session: null,
      user: null,
      isAuthenticated: false
    }
  }
}

export default defineNuxtRouteMiddleware(async (to) => {
  // Add debug logging to see if middleware is triggered
  console.log(`🚀 Auth middleware triggered for: ${to.path}`)
  
  // Handle server-side checks for better UX and security
  if (import.meta.server) {
    console.log(`🖥️ Server-side auth check for: ${to.path}`)
    
    // Check if current route matches any configured route
    const matchedRoute = protectedRoutes.find(route => route.pattern.test(to.path))
    
    if (!matchedRoute) {
      return // Route is not configured, allow access
    }
    
    // Get server-side session using Better Auth (避免导入数据库模块)
    const headers = useRequestHeaders(['cookie'])
    let serverSession = null
    
    try {
      // 使用 Better Auth 的服务端 API 获取 session
      const { auth } = await import('@libs/auth')
      const reqHeaders = new Headers()
      Object.entries(headers).forEach(([key, value]) => {
        if (value) reqHeaders.set(key, value)
      })
      
      const session = await auth.api.getSession({ headers: reqHeaders })
      serverSession = session
    } catch (error) {
      console.error('Failed to get server session:', error)
    }
    
    const isAuthenticated = !!serverSession?.user
    const user = serverSession?.user
    
    // --- 服务端认证检查 ---
    if (!isAuthenticated && matchedRoute.requiresAuth !== false && !matchedRoute.isAuthRoute) {
      console.log(`🔒 Server-side authentication failed for: ${to.path}`)
      const localePath = useLocalePath()
      const signinPath = localePath('/signin')
      // Add returnTo parameter to redirect back after login (Nuxt handles encoding)
      return navigateTo({
        path: signinPath,
        query: {
          returnTo: to.fullPath
        }
      })
    }
    
    // --- 服务端权限检查（关键安全检查）---
    if (matchedRoute.requiredPermission && isAuthenticated) {
      console.log(`🛡️ Server-side permission check for: ${to.path}`)
      
      try {
        // 使用权限系统进行检查（不导入数据库模块）
        const appUser = createAppUser(user!)
        const hasPermission = can(appUser, matchedRoute.requiredPermission.action, matchedRoute.requiredPermission.subject)
        
        if (!hasPermission) {
          console.log(`❌ Server-side permission denied for: ${to.path}`)
          throw createError({
            statusCode: 403,
            statusMessage: 'Access Denied: Insufficient permissions'
          })
        }
        
        console.log(`✅ Server-side permission granted for: ${to.path}`)
      } catch (error) {
        console.error('Server-side permission check failed:', error)
        throw createError({
          statusCode: 403,
          statusMessage: 'Access Denied'
        })
      }
    }
    
    // --- 处理认证路由重定向 ---
    if (matchedRoute.isAuthRoute && isAuthenticated) {
      console.log(`↩️ Server-side: authenticated user accessing auth route, redirecting to dashboard`)
      const localePath = useLocalePath()
      return navigateTo(localePath('/dashboard'))
    }
    
    console.log(`✅ Server-side checks passed for: ${to.path}`)
    return // 服务端检查通过，继续到客户端或渲染页面
  }

  console.log(`🌐 Processing auth middleware on client for: ${to.path}`)
  
  // 客户端主要处理订阅检查和体验优化（认证和权限已在服务端检查）
  console.log(`🔍 Checking path: ${to.path}`)

  // Check if current route matches any configured route
  const matchedRoute = protectedRoutes.find(route => route.pattern.test(to.path))
  
  if (!matchedRoute) {
    return // Route is not configured
  }

  console.log(`🔒 Client-side processing for: ${to.path} (Type: ${matchedRoute.type})`)

  // Get user session for client-side checks
  const { user, isAuthenticated } = await getUserSession()
  console.log(`🔍 Client session result: isAuthenticated=${isAuthenticated}, user=${user ? user.id : 'null'}`)

  // --- Client-side authentication check ---
  if (!isAuthenticated && matchedRoute.requiresAuth !== false && !matchedRoute.isAuthRoute) {
    console.log(`🔒 Client-side authentication failed for: ${to.path}`)
    const localePath = useLocalePath()
    const signinPath = localePath('/signin')
    // Add returnTo parameter to redirect back after login (Nuxt handles encoding)
    return navigateTo({
      path: signinPath,
      query: {
        returnTo: to.fullPath
      }
    })
  }

  // --- Handle auth routes for authenticated users (client-side) ---
  if (matchedRoute.isAuthRoute && isAuthenticated) {
    console.log(`↩️ Client-side: authenticated user accessing auth route, redirecting to dashboard`)
    const localePath = useLocalePath()
    return navigateTo(localePath('/dashboard'))
  }

  // --- Client-side permission check ---
  if (matchedRoute.requiredPermission && isAuthenticated) {
    console.log(`🛡️ Client-side permission check for: ${to.path}`)
    
    try {
      const appUser = createAppUser(user!)
      const hasPermission = can(appUser, matchedRoute.requiredPermission.action, matchedRoute.requiredPermission.subject)
      
      if (!hasPermission) {
        console.log(`❌ Client-side permission denied for: ${to.path}`)
        throw createError({
          statusCode: 403,
          statusMessage: 'Access Denied: Insufficient permissions'
        })
      }
      
      console.log(`✅ Client-side permission granted for: ${to.path}`)
    } catch (error) {
      console.error('Client-side permission check failed:', error)
      throw createError({
        statusCode: 403,
        statusMessage: 'Access Denied'
      })
    }
  }

  // --- 客户端订阅检查（体验优化）---
  if (matchedRoute.requiresSubscription && isAuthenticated) {
    console.log(`💳 Client-side subscription check for: ${to.path}, User: ${user!.id}`)
    
    const hasSubscription = await hasValidSubscription(user!.id)
    
    if (!hasSubscription) {
      console.log(`❌ Client-side subscription check failed for: ${to.path}, User: ${user!.id}`)
      
      if (matchedRoute.type === 'page') {
        // Redirect to pricing page using Nuxt i18n
        const localePath = useLocalePath()
        return navigateTo(localePath('/pricing'))
      } else {
        throw createError({
          statusCode: 402,
          statusMessage: 'Subscription required'
        })
      }
    }
    
    console.log(`✅ Client-side subscription check passed for: ${to.path}`)
  }

  // --- 客户端订阅用户重定向检查 ---
  if (matchedRoute.redirectIfSubscribed && isAuthenticated) {
    console.log(`💰 Client-side checking if subscribed user should be redirected from: ${to.path}, User: ${user!.id}`)
    
    const hasSubscription = await hasValidSubscription(user!.id)
    
    if (hasSubscription) {
      console.log(`↩️ Client-side: subscribed user redirecting from ${to.path} to dashboard`)
      const localePath = useLocalePath()
      return navigateTo(localePath('/dashboard'))
    }
    
    console.log(`✅ Client-side: non-subscribed user allowed access to: ${to.path}`)
  }

  console.log(`✅ Client-side checks completed for: ${to.path}`)
  console.log(`🏁 Middleware completed successfully for: ${to.path}`)
})

// --- Two-Layer Authorization Concept ---
// This middleware handles the FIRST layer of authorization:
// 1. Authentication: Is the user logged in?
// 2. General Permissions: Does the user's role/abilities generally allow
//    them to perform the requested action on the requested resource type?
//    Example check: can(user, Action.DELETE, Subject.ARTICLE)

// The SECOND layer of authorization (instance-specific checks) 
// MUST happen later, within the specific API route handler or page component.
// This is because middleware doesn't have access to the specific resource instance.

// Example for API Route Handler (e.g., server/api/articles/[id].delete.ts):
/*
export default defineEventHandler(async (event) => {
  // 1. Get session (already passed middleware auth check)
  const session = await getServerSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  // 2. Get the specific resource ID
  const articleId = getRouterParam(event, 'id')

  // 3. Fetch the resource instance from the database
  const article = await db.article.findUnique({ where: { id: articleId } })
  if (!article) {
    throw createError({ statusCode: 404, statusMessage: 'Article not found' })
  }

  // 4. Perform the INSTANCE-SPECIFIC permission check
  const appUser = createAppUser(session.user)
  const hasPermission = can(appUser, Action.DELETE, Subject.ARTICLE, article)

  if (!hasPermission) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  // 5. Proceed with the operation
  await db.article.delete({ where: { id: articleId } })
  return { success: true }
})
*/ 