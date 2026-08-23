import { authClientVue } from '@libs/auth/authClient'

/**
 * Authentication composable for Nuxt.js
 * Provides authentication state and utilities
 */
export const useAuth = () => {
  // Get authentication state from Better-Auth
  const session = authClientVue.useSession()

  // Computed properties for easier access
  const isAuthenticated = computed(() => !!session.value?.data?.user)
  const user = computed(() => session.value?.data?.user)
  
  /**
   * Sign out user
   */
  const signOut = async () => {
    const { data, error } = await authClientVue.signOut()
    
    if (error) {
      console.error('Sign out error:', error)
      return
    }
    
    await navigateTo(useLocalePath()('/'))
  }

  /**
   * Check if user has specific role
   */
  const hasRole = (role: string) => {
    return computed(() => user.value?.role === role)
  }

  /**
   * Check if user is admin
   */
  const isAdmin = computed(() => user.value?.role === 'admin')

  /**
   * Redirect to sign in page
   */
  const redirectToSignIn = (returnUrl?: string) => {
    const localePath = useLocalePath()
    const signinPath = localePath('/signin')
    
    if (returnUrl) {
      return navigateTo({
        path: signinPath,
        query: {
          returnTo: returnUrl
        }
      })
    }
    
    return navigateTo(signinPath)
  }

  /**
   * Require authentication (throw error if not authenticated)
   */
  const requireAuth = () => {
    if (!isAuthenticated.value) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Authentication required'
      })
    }
  }

  return {
    // State
    session,
    isAuthenticated,
    user,
    isAdmin,
    
    // Methods
    signOut,
    hasRole,
    redirectToSignIn,
    requireAuth
  }
} 