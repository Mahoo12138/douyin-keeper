import { computed, type ComputedRef } from 'vue'
import { Action, Subject, can, getAvailableActions, createAppUser, type AppUser } from '@libs/permissions'

/**
 * Vue composable for permissions checking based on @libs/permissions RBAC system
 * Adapted from the React hooks in libs/permissions/hooks.ts
 */

/**
 * Check if user has permission for specific action on subject
 */
export function usePermission(
  user: ComputedRef<any> | Ref<any>,
  action: Action,
  subject: Subject,
  data?: any
): ComputedRef<boolean> {
  return computed(() => {
    const userValue = unref(user)
    if (!userValue) return false
    
    const appUser = createAppUser(userValue)
    return can(appUser, action, subject, data)
  })
}

/**
 * Get all available actions for user on specific subject
 */
export function useAvailableActions(
  user: ComputedRef<any> | Ref<any>,
  subject: Subject
): ComputedRef<Action[]> {
  return computed(() => {
    const userValue = unref(user)
    if (!userValue) return []
    
    const appUser = createAppUser(userValue)
    return getAvailableActions(appUser, subject)
  })
}

/**
 * Advanced permissions interface with multiple utility functions
 */
export function useAbility(user: ComputedRef<any> | Ref<any>) {
  /**
   * Check permission for action on subject
   */
  const checkPermission = (action: Action, subject: Subject, data?: any): boolean => {
    const userValue = unref(user)
    if (!userValue) return false
    
    const appUser = createAppUser(userValue)
    return can(appUser, action, subject, data)
  }

  /**
   * Get available actions for subject
   */
  const getActions = (subject: Subject): Action[] => {
    const userValue = unref(user)
    if (!userValue) return []
    
    const appUser = createAppUser(userValue)
    return getAvailableActions(appUser, subject)
  }

  /**
   * Check if user is admin
   */
  const isAdmin = computed(() => {
    const userValue = unref(user)
    if (!userValue) return false
    
    const appUser = createAppUser(userValue)
    return can(appUser, Action.MANAGE, Subject.ALL)
  })

  /**
   * Check if user is VIP
   */
  const isVip = computed(() => {
    const userValue = unref(user)
    return userValue?.role === 'vip' || userValue?.role === 'admin'
  })

  return {
    can: checkPermission,
    getActions,
    isAdmin,
    isVip
  }
}

/**
 * Utility function to create AppUser from session user
 */
export function useAppUser(user: ComputedRef<any> | Ref<any>): ComputedRef<AppUser | null> {
  return computed(() => {
    const userValue = unref(user)
    if (!userValue) return null
    
    return createAppUser(userValue)
  })
} 