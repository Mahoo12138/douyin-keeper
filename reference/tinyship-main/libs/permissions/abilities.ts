import { AbilityBuilder, createMongoAbility, MongoAbility } from '@casl/ability';
import { Action, AppUser, Role, Subject } from './types';

/**
 * 定义权限能力接口
 */
export type AppAbility = MongoAbility<[Action, Subject | 'all']>;

/**
 * 根据用户角色定义不同的权限规则
 */
export function defineRulesForUser(user: AppUser): AppAbility {
  const { can, cannot, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

  // 根据用户角色设置权限
  switch (user.role) {
    case Role.ADMIN:
      // 管理员拥有所有权限
      can(Action.MANAGE, Subject.ALL);
      break;

    case Role.VIP:
      // VIP用户权限
      can([Action.READ, Action.CREATE, Action.UPDATE], Subject.PROJECT);
      can([Action.READ, Action.CREATE], Subject.REPORT);
      can(Action.READ, Subject.SUBSCRIPTION);
      can([Action.READ, Action.UPDATE], Subject.USER);
      can(Action.READ, Subject.SETTING);
      break;

    case Role.NORMAL:
    default:
      // 普通用户权限
      can([Action.READ, Action.CREATE], Subject.PROJECT);
      can(Action.READ, Subject.REPORT);
      can([Action.READ, Action.UPDATE], Subject.USER);
      break;
  }

  return build();
}

/**
 * 创建用户权限实例
 */
export function createAbilityForUser(user: AppUser): AppAbility {
  return defineRulesForUser(user);
} 