import { describe, test, expect } from 'vitest';
import { 
  Action, 
  Subject, 
  Role,
  can,
  getAvailableActions,
  mapDatabaseRoleToAppRole
} from '@libs/permissions';
import { mockAdminUser, mockNormalUser, mockVipUser, mockProjects, mockReports } from './mock-data';

// 修改的用户权限检查函数
const checkUserPermission = (userId: string, action: Action, resourceType: Subject, resourceDetails?: any) => {
  // 确定用户角色
  let user;
  if (userId === mockAdminUser.id) {
    user = mockAdminUser;
  } else if (userId === mockVipUser.id) {
    user = mockVipUser;
  } else if (userId === mockNormalUser.id) {
    user = mockNormalUser;
  } else {
    return false; // 未知用户
  }
  
  // 检查用户是否有权限
  return can(user, action, resourceType, resourceDetails);
};

// 模拟应用程序中的使用场景
describe('应用场景集成测试', () => {
  
  describe('项目管理场景', () => {
    test('用户应该能查看项目', () => {
      // 管理员可以查看任何项目
      expect(checkUserPermission(
        mockAdminUser.id, 
        Action.READ, 
        Subject.PROJECT
      )).toBe(true);
      
      // VIP用户可以查看项目
      expect(checkUserPermission(
        mockVipUser.id, 
        Action.READ, 
        Subject.PROJECT
      )).toBe(true);
      
      // 普通用户可以查看项目
      expect(checkUserPermission(
        mockNormalUser.id, 
        Action.READ, 
        Subject.PROJECT
      )).toBe(true);
    });
    
    test('普通用户不能修改项目，但VIP用户可以', () => {
      // 普通用户无法修改项目
      expect(checkUserPermission(
        mockNormalUser.id, 
        Action.UPDATE, 
        Subject.PROJECT
      )).toBe(false);
      
      // VIP用户可以修改项目
      expect(checkUserPermission(
        mockVipUser.id, 
        Action.UPDATE, 
        Subject.PROJECT
      )).toBe(true);
    });
    
    test('管理员可以管理任何项目', () => {
      // 管理员可以查看项目
      expect(checkUserPermission(
        mockAdminUser.id, 
        Action.READ, 
        Subject.PROJECT
      )).toBe(true);
      
      // 管理员可以修改项目
      expect(checkUserPermission(
        mockAdminUser.id, 
        Action.UPDATE, 
        Subject.PROJECT
      )).toBe(true);
      
      // 管理员可以删除项目
      expect(checkUserPermission(
        mockAdminUser.id, 
        Action.DELETE, 
        Subject.PROJECT
      )).toBe(true);
    });
  });
  
  describe('报告查看场景', () => {
    test('所有用户都可以查看报告', () => {
      // 普通用户可以查看报告
      expect(checkUserPermission(
        mockNormalUser.id, 
        Action.READ, 
        Subject.REPORT
      )).toBe(true);
      
      // VIP用户可以查看报告
      expect(checkUserPermission(
        mockVipUser.id, 
        Action.READ, 
        Subject.REPORT
      )).toBe(true);
    });
    
    test('VIP用户可以创建报告，普通用户不能', () => {
      // VIP用户可以创建报告
      expect(checkUserPermission(
        mockVipUser.id, 
        Action.CREATE, 
        Subject.REPORT
      )).toBe(true);
      
      // 普通用户不能创建报告
      expect(checkUserPermission(
        mockNormalUser.id, 
        Action.CREATE, 
        Subject.REPORT
      )).toBe(false);
    });
  });
  
  describe('用户信息管理场景', () => {
    test('用户可以查看和更新自己的信息', () => {
      // 用户可以查看自己的信息
      expect(can(mockNormalUser, Action.READ, Subject.USER, { id: mockNormalUser.id })).toBe(true);
      
      // 用户可以更新自己的信息
      expect(can(mockNormalUser, Action.UPDATE, Subject.USER, { id: mockNormalUser.id })).toBe(true);
    });
    
    test('用户不能查看或更新其他用户的信息', () => {
      // 普通用户不能查看其他用户的信息
      expect(can(mockNormalUser, Action.READ, Subject.USER, { id: mockVipUser.id })).toBe(false);
      
      // VIP用户也不能查看其他用户的信息
      expect(can(mockVipUser, Action.READ, Subject.USER, { id: mockNormalUser.id })).toBe(false);
    });
    
    test('管理员可以查看和管理所有用户的信息', () => {
      // 管理员可以查看任何用户的信息
      expect(can(mockAdminUser, Action.READ, Subject.USER, { id: mockNormalUser.id })).toBe(true);
      expect(can(mockAdminUser, Action.READ, Subject.USER, { id: mockVipUser.id })).toBe(true);
      
      // 管理员可以更新任何用户的信息
      expect(can(mockAdminUser, Action.UPDATE, Subject.USER, { id: mockNormalUser.id })).toBe(true);
      expect(can(mockAdminUser, Action.UPDATE, Subject.USER, { id: mockVipUser.id })).toBe(true);
    });
  });
}); 