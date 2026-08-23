import { describe, test, expect } from 'vitest';
import { 
  Action, 
  Subject, 
  Role,
  can, 
  getAbility, 
  getAvailableActions, 
  mapDatabaseRoleToAppRole 
} from '@libs/permissions';
import { mockAdminUser, mockNormalUser, mockVipUser, mockProjects } from './mock-data';

describe('权限工具函数测试', () => {
  describe('can函数', () => {
    test('正确用户和操作时应返回true', () => {
      // 管理员可以做任何事
      expect(can(mockAdminUser, Action.READ, Subject.PROJECT)).toBe(true);
      
      // VIP用户可以创建报告
      expect(can(mockVipUser, Action.CREATE, Subject.REPORT)).toBe(true);
      
      // 普通用户可以读取项目
      expect(can(mockNormalUser, Action.READ, Subject.PROJECT)).toBe(true);
    });
    
    test('无权限时应返回false', () => {
      // 普通用户不能创建报告
      expect(can(mockNormalUser, Action.CREATE, Subject.REPORT)).toBe(false);
      
      // 普通用户不能读取设置
      expect(can(mockNormalUser, Action.READ, Subject.SETTING)).toBe(false);
    });
    
    test('用户为null或undefined时应返回false', () => {
      expect(can(null, Action.READ, Subject.PROJECT)).toBe(false);
      expect(can(undefined, Action.READ, Subject.PROJECT)).toBe(false);
    });
    
    test('条件权限检查应正确工作', () => {
      // 普通用户可以更新自己的用户信息
      expect(can(mockNormalUser, Action.UPDATE, Subject.USER, { id: mockNormalUser.id })).toBe(true);
      
      // 普通用户不能更新他人的用户信息
      expect(can(mockNormalUser, Action.UPDATE, Subject.USER, { id: 'other_id' })).toBe(false);
      
      // 管理员可以更新任何用户的信息
      expect(can(mockAdminUser, Action.UPDATE, Subject.USER, { id: mockNormalUser.id })).toBe(true);
      expect(can(mockAdminUser, Action.UPDATE, Subject.USER, { id: 'any_user_id' })).toBe(true);
    });
  });
  
  describe('getAbility函数', () => {
    test('应该返回能力实例', () => {
      const ability = getAbility(mockNormalUser);
      expect(ability).toBeDefined();
      expect(typeof ability.can).toBe('function');
    });
    
    test('返回的能力实例应包含正确的权限', () => {
      const ability = getAbility(mockVipUser);
      
      // VIP用户可以创建项目
      expect(ability.can(Action.CREATE, Subject.PROJECT)).toBe(true);
      
      // VIP用户不能删除报告
      expect(ability.can(Action.DELETE, Subject.REPORT)).toBe(false);
    });
  });
  
  describe('mapDatabaseRoleToAppRole函数', () => {
    test('应该正确映射数据库角色到应用角色', () => {
      expect(mapDatabaseRoleToAppRole('admin')).toBe(Role.ADMIN);
      expect(mapDatabaseRoleToAppRole('vip')).toBe(Role.VIP);
      expect(mapDatabaseRoleToAppRole('normal')).toBe(Role.NORMAL);
      expect(mapDatabaseRoleToAppRole('user')).toBe(Role.NORMAL);
    });
    
    test('未知角色应该映射到默认角色NORMAL', () => {
      expect(mapDatabaseRoleToAppRole('unknown')).toBe(Role.NORMAL);
      expect(mapDatabaseRoleToAppRole('')).toBe(Role.NORMAL);
    });
  });
  
  describe('getAvailableActions函数', () => {
    test('应该返回用户对某个资源的所有可用操作', () => {
      // 管理员对项目的所有操作
      const adminActions = getAvailableActions(mockAdminUser, Subject.PROJECT);
      expect(adminActions).toContain(Action.CREATE);
      expect(adminActions).toContain(Action.READ);
      expect(adminActions).toContain(Action.UPDATE);
      expect(adminActions).toContain(Action.DELETE);
      expect(adminActions).toContain(Action.MANAGE);
      
      // VIP用户对项目的可用操作
      const vipActions = getAvailableActions(mockVipUser, Subject.PROJECT);
      expect(vipActions).toContain(Action.CREATE);
      expect(vipActions).toContain(Action.READ);
      expect(vipActions).toContain(Action.UPDATE);
      expect(vipActions).not.toContain(Action.DELETE);
      expect(vipActions).not.toContain(Action.MANAGE);
      
      // 普通用户对报告的可用操作
      const normalActions = getAvailableActions(mockNormalUser, Subject.REPORT);
      expect(normalActions).toContain(Action.READ);
      expect(normalActions).not.toContain(Action.CREATE);
      expect(normalActions).not.toContain(Action.UPDATE);
      expect(normalActions).not.toContain(Action.DELETE);
    });
    
    test('用户没有权限时应返回空数组', () => {
      // 普通用户对设置的操作（没有权限）
      const actions = getAvailableActions(mockNormalUser, Subject.SETTING);
      expect(actions).toHaveLength(0);
    });
  });
}); 