import { Action, AppUser, Role, Subject } from './types';
import { AppAbility, createAbilityForUser } from './abilities';

/**
 * 检查用户是否可以执行特定操作
 * @param user 当前用户
 * @param action 要执行的操作
 * @param subject 操作的主体/资源
 * @param data 可选的资源数据
 * @returns boolean 是否有权限
 */
export function can(
  user: AppUser | null | undefined,
  action: Action,
  subject: Subject,
  data?: any
): boolean {
  if (!user) return false;
  
  const ability = createAbilityForUser(user);
  
  // 特殊处理用户资源 - 只能修改自己的用户信息
  if (subject === Subject.USER && data && typeof data === 'object' && 'id' in data) {
    // 管理员可以访问任何用户
    if (user.role === Role.ADMIN) {
      return ability.can(action, subject);
    }
    
    // 非管理员只能访问自己的用户信息
    if (data.id !== user.id) {
      return false;
    }
  }
  
  return ability.can(action, subject);
}

/**
 * 快速获取权限实例
 * @param user 当前用户 
 * @returns 权限检查实例
 */
export function getAbility(user: AppUser): AppAbility {
  return createAbilityForUser(user);
}

/**
 * 将数据库角色映射到权限系统角色
 * @param dbRole 数据库中的角色值
 * @returns 权限系统角色
 */
export function mapDatabaseRoleToAppRole(dbRole: string): Role {
  switch (dbRole) {
    case 'admin':
      return Role.ADMIN;
    case 'vip':
      return Role.VIP;
    case 'normal':
    case 'user':
    default:
      return Role.NORMAL;
  }
}

/**
 * 获取当前用户对某个资源的所有可用操作
 * @param user 当前用户
 * @param subject 资源类型
 * @returns 可执行的操作列表
 */
export function getAvailableActions(user: AppUser, subject: Subject): Action[] {
  const ability = createAbilityForUser(user);
  const allActions = Object.values(Action);
  
  return allActions.filter(action => ability.can(action, subject));
}

/**
 * 将数据库用户转换为带有角色的AppUser
 * @param user 数据库用户对象
 * @param defaultRole 默认角色
 * @returns AppUser对象
 */
export function createAppUser(user: any, defaultRole = 'normal'): AppUser {
  if (!user) return null as unknown as AppUser;

  return {
    ...user,
    role: mapDatabaseRoleToAppRole(user.role || defaultRole)
  };
} 