import { describe, test, expect, beforeEach } from 'vitest';
import { 
  Action, 
  Subject, 
  AppAbility, 
  defineRulesForUser, 
  createAbilityForUser,
  can
} from '@libs/permissions';
import { mockAdminUser, mockNormalUser, mockVipUser, mockProjects } from './mock-data';

describe('权限能力定义测试', () => {
  // 测试不同角色的用户
  describe('创建用户能力实例', () => {
    test('应该能成功为不同角色的用户创建能力实例', () => {
      const normalAbility = createAbilityForUser(mockNormalUser);
      const vipAbility = createAbilityForUser(mockVipUser);
      const adminAbility = createAbilityForUser(mockAdminUser);

      expect(normalAbility).toBeDefined();
      expect(vipAbility).toBeDefined();
      expect(adminAbility).toBeDefined();
      
      // 检查返回的是否为 AppAbility 类型
      expect(typeof normalAbility.can).toBe('function');
      expect(typeof vipAbility.can).toBe('function');
      expect(typeof adminAbility.can).toBe('function');
    });
  });

  // 测试管理员权限
  describe('管理员权限', () => {
    let adminAbility: AppAbility;

    beforeEach(() => {
      adminAbility = createAbilityForUser(mockAdminUser);
    });

    test('管理员应该拥有对所有资源的所有权限', () => {
      // 测试所有操作类型
      const allActions = Object.values(Action);
      
      // 测试所有资源类型
      const allSubjects = Object.values(Subject);
      
      // 管理员应该可以对所有资源执行所有操作
      for (const action of allActions) {
        for (const subject of allSubjects) {
          expect(adminAbility.can(action, subject)).toBe(true);
        }
      }
    });
  });

  // 测试VIP用户权限
  describe('VIP用户权限', () => {
    let vipAbility: AppAbility;

    beforeEach(() => {
      vipAbility = createAbilityForUser(mockVipUser);
    });

    test('VIP用户应该拥有创建、读取和更新项目的权限', () => {
      expect(vipAbility.can(Action.CREATE, Subject.PROJECT)).toBe(true);
      expect(vipAbility.can(Action.READ, Subject.PROJECT)).toBe(true);
      expect(vipAbility.can(Action.UPDATE, Subject.PROJECT)).toBe(true);
      expect(vipAbility.can(Action.DELETE, Subject.PROJECT)).toBe(false);
    });

    test('VIP用户应该拥有创建和读取报告的权限', () => {
      expect(vipAbility.can(Action.CREATE, Subject.REPORT)).toBe(true);
      expect(vipAbility.can(Action.READ, Subject.REPORT)).toBe(true);
      expect(vipAbility.can(Action.UPDATE, Subject.REPORT)).toBe(false);
      expect(vipAbility.can(Action.DELETE, Subject.REPORT)).toBe(false);
    });

    test('VIP用户应该拥有读取订阅的权限', () => {
      expect(vipAbility.can(Action.READ, Subject.SUBSCRIPTION)).toBe(true);
      expect(vipAbility.can(Action.CREATE, Subject.SUBSCRIPTION)).toBe(false);
      expect(vipAbility.can(Action.UPDATE, Subject.SUBSCRIPTION)).toBe(false);
      expect(vipAbility.can(Action.DELETE, Subject.SUBSCRIPTION)).toBe(false);
    });

    test('VIP用户应该能读取和更新用户信息', () => {
      expect(vipAbility.can(Action.READ, Subject.USER)).toBe(true);
      expect(vipAbility.can(Action.UPDATE, Subject.USER)).toBe(true);
      
      // 通过 can 辅助函数验证
      expect(can(mockVipUser, Action.READ, Subject.USER, { id: mockVipUser.id })).toBe(true);
      expect(can(mockVipUser, Action.UPDATE, Subject.USER, { id: mockVipUser.id })).toBe(true);
      
      // 不能更新其他用户信息
      expect(can(mockVipUser, Action.READ, Subject.USER, { id: 'another_user_id' })).toBe(false);
      expect(can(mockVipUser, Action.UPDATE, Subject.USER, { id: 'another_user_id' })).toBe(false);
    });

    test('VIP用户应该能够读取设置', () => {
      expect(vipAbility.can(Action.READ, Subject.SETTING)).toBe(true);
      expect(vipAbility.can(Action.UPDATE, Subject.SETTING)).toBe(false);
    });
  });

  // 测试普通用户权限
  describe('普通用户权限', () => {
    let normalAbility: AppAbility;

    beforeEach(() => {
      normalAbility = createAbilityForUser(mockNormalUser);
    });

    test('普通用户应该拥有创建和读取项目的权限', () => {
      expect(normalAbility.can(Action.CREATE, Subject.PROJECT)).toBe(true);
      expect(normalAbility.can(Action.READ, Subject.PROJECT)).toBe(true);
      expect(normalAbility.can(Action.UPDATE, Subject.PROJECT)).toBe(false);
      expect(normalAbility.can(Action.DELETE, Subject.PROJECT)).toBe(false);
    });

    test('普通用户应该拥有读取报告的权限', () => {
      expect(normalAbility.can(Action.READ, Subject.REPORT)).toBe(true);
      expect(normalAbility.can(Action.CREATE, Subject.REPORT)).toBe(false);
      expect(normalAbility.can(Action.UPDATE, Subject.REPORT)).toBe(false);
      expect(normalAbility.can(Action.DELETE, Subject.REPORT)).toBe(false);
    });

    test('普通用户应该能读取和更新用户信息', () => {
      expect(normalAbility.can(Action.READ, Subject.USER)).toBe(true);
      expect(normalAbility.can(Action.UPDATE, Subject.USER)).toBe(true);
      
      // 通过 can 辅助函数验证
      expect(can(mockNormalUser, Action.READ, Subject.USER, { id: mockNormalUser.id })).toBe(true);
      expect(can(mockNormalUser, Action.UPDATE, Subject.USER, { id: mockNormalUser.id })).toBe(true);
      
      // 不能更新其他用户信息
      expect(can(mockNormalUser, Action.READ, Subject.USER, { id: 'another_user_id' })).toBe(false);
      expect(can(mockNormalUser, Action.UPDATE, Subject.USER, { id: 'another_user_id' })).toBe(false);
    });

    test('普通用户不应该拥有读取设置的权限', () => {
      expect(normalAbility.can(Action.READ, Subject.SETTING)).toBe(false);
    });

    test('普通用户不应该拥有读取订阅的权限', () => {
      expect(normalAbility.can(Action.READ, Subject.SUBSCRIPTION)).toBe(false);
    });
  });
}); 